> **Status: implemented** (`server/logic/smartQueue.js planBatch`, two-stage
> ε-lexicographic engine; replaced the old heuristic in
> [`server/routes/automatch.js`](../server/routes/automatch.js)). Sections 3–5
> below match the shipped engine. Two selection-stage additions shipped after
> this spec was written and are not yet spec'd here: **Hard Anchor** (when the
> longest waiter has waited `anchorWaitMin` (15 min) or `anchorWaitRatio`
> (1.35×) the 4th-longest waiter, Stage A widens its candidate window around
> them so they are never left benched) and **Bench-First** (bench candidates
> prefer players whose consecutive-game streak is highest, feeding the rest
> rule). Consecutive counts are timestamped and decay with rest time, not
> per-assignment. Parameters live in `MATCH_CONFIG` in `server/logic/smartQueue.js`.
> The NumPy listing is reference material, not production code.

---

# Smart Badminton Queueing Algorithm

**Architecture:** Modular Two-Stage $\epsilon$-Lexicographic Combinatorial Optimizer

**Execution Model:** Zero-Loop Vectorized Tensor Pipeline ($N \le 26$)

---

## 1. Overview & Design Principles

The algorithm assigns available players to doubles courts by optimizing **queue fairness first**, followed by **participation equity**, **cohort skill homogeneity**, **opposing team balance**, and **social variety** (partner and opponent rotation).

To avoid the failure modes of naive weighted-sum scoring and strict lexicographic tie-breaking, the engine is built around five structural guarantees:

1. **Unary-First Constraint Pruning:** Player-level hard constraints (availability, rest/consecutive-game limits) are enforced *before* candidate window slicing and combinatorial expansion.
2. **Virtual Game Offset for Late Arrivals:** Latecomers are initialized with the active median virtual game count rather than dividing games by attendance duration, eliminating cold-start rate singularities and consecutive-game bursts.
3. **Quartet vs. Split Decoupling:** Metrics that depend only on the 4-player cohort (wait time, games played, cohort skill variance) are evaluated in **Stage A** on $\binom{K}{4}$ quartets. Metrics that depend on team assignment (team balance, partnership history, opponent history) are evaluated in **Stage B** on the 3 perfect matchings of each surviving quartet.
4. **$\epsilon$-Lexicographic Tolerance Bands:** Higher-priority objectives prune the search space to a tolerance band $[f_m^*, f_m^* \pm \epsilon_m]$ rather than requiring exact floating-point ties, preventing the optimizer from degenerating into naive FIFO.
5. **$K_4$ Graph-Duality Vectorization:** All pairwise skill and history calculations are computed once over the $K \times K$ candidate matrix ($\le 676$ cells) and gathered into quartet/split tensors via index broadcasting with zero Python/JS loops.

---

## 2. Vectorized State Representation

For $N$ total session players ($N \le 26$), the session state at decision epoch $t$ is stored as contiguous 1D vectors and 2D symmetric matrices. After unary filtering and candidate slicing to $K$ eligible players ($4 \le K \le 26$), all vectors have shape $(K,)$ and matrices have shape $(K, K)$:

| Symbol | Shape | DType | Description |
| --- | --- | --- | --- |
| $\mathbf{a}$ | $(N,)$ | `bool` | Availability mask (`True` if checked in, idle, and not resting/injured). |
| $\mathbf{c}$ | $(N,)$ | `int32` | Consecutive games played without sitting out at least one cycle. |
| $\mathbf{w}$ | $(K,)$ | `float32` | Elapsed waiting time (minutes) since becoming available. |
| $\mathbf{g}^{\text{virt}}$ | $(K,)$ | `float32` | Virtual games played (offset-adjusted for late arrivals). |
| $\mathbf{s}$ | $(K,)$ | `float32` | Individual skill rating (e.g., $1.0\text{--}10.0$ or Elo/MMR). |
| $\mathbf{P}$ | $(K, K)$ | `float32` | Symmetric recency-weighted partnership penalty matrix. |
| $\mathbf{O}$ | $(K, K)$ | `float32` | Symmetric recency-weighted opponent penalty matrix. |
| $\mathbf{B}_{\text{pair}}$ | $(K, K)$ | `bool` | Hard relational ban mask (`True` if pair $(i, j)$ cannot be partnered). |

### Late-Arrival Initialization & History Updates

* **Virtual Game Counter ($\mathbf{g}^{\text{virt}}$):** When player $i$ checks in late at time $t_{\text{arrive}}$, their virtual game counter is initialized to the median of currently active players:

$$g_i^{\text{virt}}(t_{\text{arrive}}) = \text{median}_{j \in \text{Active}}\left(g_j^{\text{virt}}(t_{\text{arrive}})\right)$$



Whenever player $i$ completes a game, $g_i^{\text{virt}} \leftarrow g_i^{\text{virt}} + 1$.
* **Recency-Decayed Interaction Matrices ($\mathbf{P}, \mathbf{O}$):** After every completed game on a court, global matrices decay by factor $\gamma \in (0, 1)$ (e.g., $\gamma = 0.85$ per round) and increment for the active pairs:

$$\mathbf{P}^{(r+1)} = \gamma \mathbf{P}^{(r)} + \Delta \mathbf{P}^{(r)}, \quad \mathbf{O}^{(r+1)} = \gamma \mathbf{O}^{(r)} + \Delta \mathbf{O}^{(r)}$$



where $\Delta P_{ij}^{(r)} = 1$ if $i, j$ were partners in round $r$ (else $0$), and $\Delta O_{ij}^{(r)} = 1$ if $i, j$ were opponents in round $r$ (else $0$).

---

## 3. Modular Pipeline Architecture

The matchmaking engine is decomposed into six stateless, composable modules that pass index tensors and boolean masks:

```
[Session State (N)]
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Module 1: UnaryFilter & CandidateWindowSlicer            │
│  • Filter available (a_i = True) & rest limit (c_i < C)  │
│  • Sort by queue score & slice top K candidates          │
└───────────────────────────┬──────────────────────────────┘
                            │ Candidate Vectors (K,) & Matrices (K, K)
                            ▼
┌──────────────────────────────────────────────────────────┐
│ Module 2: PairwiseKernelPrecomputer                      │
│  • Compute (K, K) Weak-Link Team Rating matrix R_team    │
│  • Lookup static combinations tensor Q of shape (M, 4)   │
└───────────────────────────┬──────────────────────────────┘
                            │ Q: (M, 4) where M = C(K, 4)
                            ▼
┌──────────────────────────────────────────────────────────┐
│ Module 3: StageA_QuartetFilter (Cohort-Level)            │
│  • Compute Wait Sum, Virtual Game Sum, Skill Variance    │
│  • Apply sequential ε-lexicographic mask cascade         │
└───────────────────────────┬──────────────────────────────┘
                            │ Surviving Quartets Q_surv: (M', 4)
                            ▼
┌──────────────────────────────────────────────────────────┐
│ Module 4: StageB_SplitOptimizer (Matching-Level)         │
│  • Gather 3 splits per quartet via K_4 edge duality      │
│  • Prune banned pairs; apply ε-lexicographic split rank  │
└───────────────────────────┬──────────────────────────────┘
                            │ Ranked Feasible Matches
                            ▼
┌──────────────────────────────────────────────────────────┐
│ Module 5: MultiCourtBatchResolver (If Courts C >= 2)     │
│  • Select C disjoint quartets minimizing max court cost  │
└──────────────────────────────────────────────────────────┘

```

---

## 4. Step-by-Step Algorithmic & Vectorized Specification

### Step 1: Unary Filtering & Candidate Window Selection

1. **Enforce Unary Hard Constraints:** Construct the eligible player index set $E$:

$$E = \left\{ i \in \{0, \dots, N-1\} \;\middle\vert{}\; a_i = \text{True} \;\land\; c_i < C_{\max} \right\}$$



*Fallback policy:* If $\vert{}E\vert{} < 4$ and total available players $\sum a_i \ge 4$, relax the consecutive-game constraint ($c_i < C_{\max}$) for players with the lowest $c_i$ until $\vert{}E\vert{} = 4$, logging a `CONSECUTIVE_LIMIT_RELAXED` telemetry flag. If $\sum a_i < 4$, return `NO_FEASIBLE_GAME`.
2. **Enforce Anti-Starvation Window ($K$):** Compute each eligible player's primary priority key $\pi_i = w_i - \alpha g_i^{\text{virt}}$ (where $\alpha > 0$ breaks wait ties in favor of fewer virtual games). Sort $E$ descending by $\pi_i$ and select the top $K$ players (default $K = 12$ for single-court, or $K = \min(\vert{}E\vert{}, 26)$ when full exhaustive search is enabled), expanding $K$ automatically to include any boundary players whose $\pi_i$ falls within $\delta_{\text{tie}}$ of $\pi_K$.

---

### Step 2: Pairwise Precomputation & Combinatorial Tensor Gather

Instead of evaluating nonlinear team formulas repeatedly across $\binom{K}{4} \times 3$ splits, precompute the $K \times K$ **Weak-Link Team Rating Matrix** $\mathbf{R} \in \mathbb{R}^{K \times K}$ once via outer array broadcasting:


$$\mathbf{R} = \omega \min\left(\mathbf{s}_{:, \text{None}}, \mathbf{s}_{\text{None}, :}\right) + (1 - \omega) \max\left(\mathbf{s}_{:, \text{None}}, \mathbf{s}_{\text{None}, :}\right)$$


where $\omega \in [0.60, 0.70]$ weights the weaker defender more heavily than the stronger attacker.

Next, slice the preallocated combinations lookup table to fetch the quartet index tensor $\mathbf{Q} \in \mathbb{Z}^{M \times 4}$, where $M = \binom{K}{4}$ and each row $q = (i_0, i_1, i_2, i_3)$ satisfies $0 \le i_0 < i_1 < i_2 < i_3 < K$.

---

### Step 3: Stage A — Vectorized Quartet Metrics & $\epsilon$-Filtering

Gather candidate attributes into $(M, 4)$ tensors using $\mathbf{Q}$ (e.g., $\mathbf{W}_Q = \mathbf{w}[\mathbf{Q}]$) and compute all cohort-level metrics along axis 1:

| Hierarchy Rank | Quartet Metric | Vectorized Tensor Formulation (Shape: $(M,)$) | Direction | Tolerance $\epsilon$ |
| --- | --- | --- | --- | --- |
| **Objective 1** | **Queue Fairness** ($f_1$) | $\mathbf{f}_1 = \sum_{d=0}^{3} \mathbf{w}[\mathbf{Q}_{:, d}]$ | Maximize | $\epsilon_1$ (e.g., $10\text{--}15\%$ of $f_1^*$) |
| **Objective 2** | **Participation Fairness** ($f_2$) | $\mathbf{f}_2 = \sum_{d=0}^{3} \mathbf{g}^{\text{virt}}[\mathbf{Q}_{:, d}]$ | Minimize | $\epsilon_2$ (e.g., $1.0$ virtual game) |
| **Objective 3** | **Cohort Skill Variance** ($f_3$) | $\mathbf{f}_3 = \text{Var}_{d=0..3}\left(\mathbf{s}[\mathbf{Q}_{:, d}]\right)$ | Minimize | $\epsilon_3$ (e.g., $1.5\text{ skill}^2$) |

#### Cascaded $\epsilon$-Masking (Stage A)

Rather than sorting all $M$ combinations by a composite scalar, sequentially narrow the boolean survivor mask $\mathbf{m} \in \{\text{True}, \text{False}\}^M$ (initialized to all `True`):

1. **Filter by Queue Fairness:**

$$f_1^* = \max_{q : m_q = \text{True}} f_1(q), \quad \mathbf{m} \leftarrow \mathbf{m} \;\land\; \left(\mathbf{f}_1 \ge f_1^* - \epsilon_1\right)$$


2. **Filter by Participation Fairness:**

$$f_2^* = \min_{q : m_q = \text{True}} f_2(q), \quad \mathbf{m} \leftarrow \mathbf{m} \;\land\; \left(\mathbf{f}_2 \le f_2^* + \epsilon_2\right)$$


3. **Filter by Cohort Skill Variance:**

$$f_3^* = \min_{q : m_q = \text{True}} f_3(q), \quad \mathbf{m} \leftarrow \mathbf{m} \;\land\; \left(\mathbf{f}_3 \le f_3^* + \epsilon_3\right)$$



Extract the surviving quartets $\mathbf{Q}_{\text{surv}} = \mathbf{Q}[\mathbf{m}]$ of shape $(M', 4)$, where typically $M' \ll M$.

---

### Step 4: Stage B — $K_4$ Edge-Duality Split Expansion & Ranking

Every 4-player quartet $(q_0, q_1, q_2, q_3)$ forms a complete graph $K_4$ with 6 undirected edges and 3 possible team splits (perfect matchings). By ordering the 6 edges symmetrically:


$$\mathbf{u} = [0, 0, 0, 1, 1, 2], \quad \mathbf{v} = [1, 2, 3, 2, 3, 3]$$


any edge $e \in \{0, 1, 2\}$ is the exact complement of edge $5 - e$:

* **Split 0:** Team 1 $= (q_0, q_1)$ [edge $0$] vs. Team 2 $= (q_2, q_3)$ [edge $5$]
* **Split 1:** Team 1 $= (q_0, q_2)$ [edge $1$] vs. Team 2 $= (q_1, q_3)$ [edge $4$]
* **Split 2:** Team 1 $= (q_0, q_3)$ [edge $2$] vs. Team 2 $= (q_1, q_2)$ [edge $3$]

Define split index vectors $\mathbf{u}_1 = [0, 0, 0]$, $\mathbf{v}_1 = [1, 2, 3]$ (Team 1) and $\mathbf{u}_2 = [2, 1, 1]$, $\mathbf{v}_2 = [3, 3, 2]$ (Team 2). For all $M'$ surviving quartets and all 3 splits simultaneously (shape $(M', 3)$):

1. **Relational Hard Constraint Mask ($\mathbf{M}_{\text{valid}} \in \text{bool}^{M' \times 3}$):**

$$\mathbf{M}_{\text{valid}} = \neg \left( \mathbf{B}_{\text{pair}}\left[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_1], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_1]\right] \;\lor\; \mathbf{B}_{\text{pair}}\left[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_2], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_2]\right] \right)$$


2. **Objective 4 — Team Balance Disparity ($\mathbf{F}_4 \in \mathbb{R}^{M' \times 3}$):**

$$\mathbf{F}_4 = \left\vert{} \mathbf{R}\left[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_1], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_1]\right] - \mathbf{R}\left[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_2], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_2]\right] \right\vert{}$$


3. **Objective 5 — Partnership & Opponent Redundancy ($\mathbf{F}_5 \in \mathbb{R}^{M' \times 3}$):**
Let $\mathbf{P}_{\text{split}} = \mathbf{P}[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_1], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_1]] + \mathbf{P}[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_2], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_2]]$ be the partner penalty for each split. Since the 4 opposing pairs in a split are simply the 4 non-partner edges of $K_4$, the opponent penalty is:

$$\mathbf{O}_{\text{split}} = \left(\sum_{e=0}^{5} \mathbf{O}\left[\mathbf{Q}_{\text{surv}}[:, u_e], \mathbf{Q}_{\text{surv}}[:, v_e]\right]\right)_{:, \text{None}} - \left(\mathbf{O}\left[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_1], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_1]\right] + \mathbf{O}\left[\mathbf{Q}_{\text{surv}}[:, \mathbf{u}_2], \mathbf{Q}_{\text{surv}}[:, \mathbf{v}_2]\right]\right)$$


$$\mathbf{F}_5 = \mathbf{P}_{\text{split}} + \beta \mathbf{O}_{\text{split}}, \quad \beta \in [0, 0.5]$$



#### Stage B Selection

Filter $(q, s) \in \{0, \dots, M'-1\} \times \{0, 1, 2\}$ where $\mathbf{M}_{\text{valid}}[q, s] = \text{True}$:

1. Retain splits within $\epsilon_4$ of the minimum team imbalance: $F_4(q, s) \le \min F_4 + \epsilon_4$.
2. Among those, select $(q^*, s^*)$ minimizing redundancy $F_5(q, s)$ (breaking any remaining ties by lowest $F_4(q, s)$, then highest $f_1(q)$).

---

## 5. Multi-Court Batch Assignment ($C \ge 2$ Open Courts)

When $C \ge 2$ courts are open simultaneously (or within a lookahead window $\Delta t_{\text{lookahead}} \le 90\text{ s}$), sequential single-court selection greedily assigns the most homogeneous quartet to Court 1 and leaves a high-variance residual pool for Court 2.

To eliminate greedy starvation across $C$ courts ($4C \le K$):

1. Run **Stage A** with a widened candidate window $K = \min(\vert{}E\vert{}, \max(12, 4C + 4))$ and compute the best split cost $J(q) = \lambda_3 f_3(q) + \lambda_4 \min_s F_4(q, s) + \lambda_5 \min_s F_5(q, s)$ for each surviving quartet $q \in \mathbf{Q}_{\text{surv}}$.
2. Represent each quartet $q$ as a 26-bit integer bitmask $\text{mask}(q) = \sum_{d=0}^3 2^{q_d}$. Two quartets $q_a, q_b$ are player-disjoint if and only if $(\text{mask}(q_a) \;\text{AND}\; \text{mask}(q_b)) = 0$.
3. Select $C$ mutually disjoint quartets $(q^{(1)}, \dots, q^{(C)})$ that minimize the **worst-case court cost** (lexicographic $\min\max$), with secondary tie-breaking on the sum of court costs:

$$\min_{\substack{q^{(1)}, \dots, q^{(C)} \in \mathbf{Q}_{\text{surv}} \\ \text{mask}(q^{(a)}) \cap \text{mask}(q^{(b)}) = \emptyset}} \left( \max_{c=1..C} J\left(q^{(c)}\right), \;\sum_{c=1..C} J\left(q^{(c)}\right) \right)$$



---

## 6. Reference Vectorized Implementation (Python / NumPy)

The modular reference implementation below executes the entire Two-Stage $\epsilon$-Lexicographic pipeline using pure NumPy array broadcasting and bitwise masks (zero loops in Stage A and Stage B):

```python
from dataclasses import dataclass
from itertools import combinations
import numpy as np
from numpy.typing import NDArray

# Precompute static K_4 edge indices for vectorized split gathering
EDGE_U = np.array([0, 0, 0, 1, 1, 2], dtype=np.intp)
EDGE_V = np.array([1, 2, 3, 2, 3, 3], dtype=np.intp)
SPLIT_U1 = np.array([0, 0, 0], dtype=np.intp)
SPLIT_V1 = np.array([1, 2, 3], dtype=np.intp)
SPLIT_U2 = np.array([2, 1, 1], dtype=np.intp)
SPLIT_V2 = np.array([3, 3, 2], dtype=np.intp)


@dataclass(frozen=True)
class MatchmakingConfig:
    max_consecutive_games: int = 2
    candidate_pool_size: int = 12
    weak_link_weight: float = 0.65       # w in [0.60, 0.70]
    opponent_penalty_weight: float = 0.25 # beta
    eps_wait_ratio: float = 0.12         # 12% tolerance band below max quartet wait
    eps_wait_min: float = 4.0            # Minimum wait tolerance band (minutes)
    eps_virt_games: float = 1.0          # Tolerance band on quartet virtual games sum
    eps_skill_var: float = 1.25          # Tolerance band on cohort skill variance
    eps_team_diff: float = 0.35          # Tolerance band on opposing team rating diff


@dataclass
class MatchAssignment:
    team_1: tuple[int, int]
    team_2: tuple[int, int]
    metrics: dict[str, float]
    relaxed_consecutive_rule: bool = False


class VectorizedBadmintonMatcher:
    """Modular, zero-loop vectorized matcher for N <= 26 players."""

    def __init__(self, config: MatchmakingConfig = MatchmakingConfig(), max_k: int = 26):
        self.cfg = config
        # Cache all C(k, 4) index tensors once at initialization
        self._comb_cache: dict[int, NDArray[np.intp]] = {
            k: np.fromiter(combinations(range(k), 4), dtype=np.dtype((np.intp, 4)))
            for k in range(4, max_k + 1)
        }

    # -------------------------------------------------------------------------
    # Module 1: Unary Filter & Candidate Window Slicer
    # -------------------------------------------------------------------------
    def select_candidates(
        self,
        available: NDArray[np.bool_],
        consecutive_games: NDArray[np.int32],
        wait_mins: NDArray[np.float32],
        virt_games: NDArray[np.float32],
        required_players: int = 4,
    ) -> tuple[NDArray[np.intp], bool]:
        avail_idx = np.flatnonzero(available)
        if avail_idx.size < required_players:
            return np.array([], dtype=np.intp), False

        eligible_mask = consecutive_games[avail_idx] < self.cfg.max_consecutive_games
        eligible_idx = avail_idx[eligible_mask]
        relaxed = False

        # Fallback: gracefully relax consecutive limit only if < 4 eligible
        if eligible_idx.size < required_players:
            relaxed = True
            order = np.argsort(consecutive_games[avail_idx], kind="stable")
            eligible_idx = avail_idx[order[:required_players]]

        # Priority key for candidate window ordering: wait time minus virtual game tie-breaker
        priority = wait_mins[eligible_idx] - 2.0 * virt_games[eligible_idx]
        rank_order = np.argsort(-priority, kind="stable")
        sorted_eligible = eligible_idx[rank_order]

        k_target = max(self.cfg.candidate_pool_size, required_players)
        if sorted_eligible.size <= k_target:
            return sorted_eligible, relaxed

        # Expand window to include boundary ties within 1e-4
        cutoff_score = priority[rank_order[k_target - 1]]
        keep_mask = priority[rank_order] >= (cutoff_score - 1e-4)
        return sorted_eligible[keep_mask], relaxed

    # -------------------------------------------------------------------------
    # Module 2: Pairwise Kernel Precomputer
    # -------------------------------------------------------------------------
    def compute_team_rating_matrix(self, skills: NDArray[np.float32]) -> NDArray[np.float32]:
        s_col, s_row = skills[:, None], skills[None, :]
        w = self.cfg.weak_link_weight
        return w * np.minimum(s_col, s_row) + (1.0 - w) * np.maximum(s_col, s_row)

    # -------------------------------------------------------------------------
    # Module 3: Stage A — Vectorized Quartet Filtering
    # -------------------------------------------------------------------------
    def filter_quartets_stage_a(
        self,
        Q: NDArray[np.intp],
        wait_mins: NDArray[np.float32],
        virt_games: NDArray[np.float32],
        skills: NDArray[np.float32],
    ) -> tuple[NDArray[np.intp], NDArray[np.float32], NDArray[np.float32], NDArray[np.float32]]:
        # Gather (M, 4) attribute tensors and reduce along axis=1
        f1_wait = wait_mins[Q].sum(axis=1)
        f2_games = virt_games[Q].sum(axis=1)
        f3_var = skills[Q].var(axis=1)

        # 1. Queue Fairness tolerance band
        f1_max = f1_wait.max()
        eps_wait = max(self.cfg.eps_wait_min, self.cfg.eps_wait_ratio * f1_max)
        mask = f1_wait >= (f1_max - eps_wait)

        # 2. Participation Fairness tolerance band
        f2_min = f2_games[mask].min()
        mask &= f2_games <= (f2_min + self.cfg.eps_virt_games)

        # 3. Cohort Skill Variance tolerance band
        f3_min = f3_var[mask].min()
        mask &= f3_var <= (f3_min + self.cfg.eps_skill_var)

        return Q[mask], f1_wait[mask], f2_games[mask], f3_var[mask]

    # -------------------------------------------------------------------------
    # Module 4: Stage B — Vectorized Split Expansion & Evaluation
    # -------------------------------------------------------------------------
    def evaluate_splits_stage_b(
        self,
        Q_surv: NDArray[np.intp],
        R_team: NDArray[np.float32],
        P_partner: NDArray[np.float32],
        O_opponent: NDArray[np.float32],
        B_ban: NDArray[np.bool_],
    ) -> tuple[NDArray[np.bool_], NDArray[np.float32], NDArray[np.float32]]:
        # Partner index pairs for each of the 3 splits: shape (M', 3)
        u1, v1 = Q_surv[:, SPLIT_U1], Q_surv[:, SPLIT_V1]
        u2, v2 = Q_surv[:, SPLIT_U2], Q_surv[:, SPLIT_V2]

        # Hard relational constraint mask
        valid_splits = ~(B_ban[u1, v1] | B_ban[u2, v2])

        # Objective 4: Weak-link team balance difference |R(T1) - R(T2)|
        f4_team_diff = np.abs(R_team[u1, v1] - R_team[u2, v2])

        # Objective 5: Partnership + Opponent redundancy via K_4 edge duality
        partner_pen = P_partner[u1, v1] + P_partner[u2, v2]
        all_6_opp_edges = O_opponent[Q_surv[:, EDGE_U], Q_surv[:, EDGE_V]].sum(axis=1, keepdims=True)
        opp_pen = all_6_opp_edges - (O_opponent[u1, v1] + O_opponent[u2, v2])
        f5_variety = partner_pen + self.cfg.opponent_penalty_weight * opp_pen

        return valid_splits, f4_team_diff, f5_variety

    # -------------------------------------------------------------------------
    # Single-Court End-to-End Execution
    # -------------------------------------------------------------------------
    def match_single_court(
        self,
        available: NDArray[np.bool_],
        consecutive_games: NDArray[np.int32],
        wait_mins: NDArray[np.float32],
        virt_games: NDArray[np.float32],
        skills: NDArray[np.float32],
        P_partner: NDArray[np.float32],
        O_opponent: NDArray[np.float32],
        B_ban: NDArray[np.bool_] | None = None,
    ) -> MatchAssignment | None:
        cand_idx, relaxed = self.select_candidates(
            available, consecutive_games, wait_mins, virt_games, required_players=4
        )
        K = cand_idx.size
        if K < 4:
            return None

        # Slice state vectors/matrices to candidate window K
        w_k, g_k, s_k = wait_mins[cand_idx], virt_games[cand_idx], skills[cand_idx]
        P_k = P_partner[np.ix_(cand_idx, cand_idx)]
        O_k = O_opponent[np.ix_(cand_idx, cand_idx)]
        B_k = (
            B_ban[np.ix_(cand_idx, cand_idx)]
            if B_ban is not None
            else np.zeros((K, K), dtype=np.bool_)
        )

        R_k = self.compute_team_rating_matrix(s_k)
        Q = self._comb_cache[K]

        # Stage A: Filter quartets
        Q_surv, f1_surv, f2_surv, f3_surv = self.filter_quartets_stage_a(Q, w_k, g_k, s_k)

        # Stage B: Evaluate 3 splits per surviving quartet
        valid_splits, f4_diff, f5_var = self.evaluate_splits_stage_b(Q_surv, R_k, P_k, O_k, B_k)
        if not np.any(valid_splits):
            return None

        # Apply Team Balance tolerance band (Objective 4)
        f4_masked = np.where(valid_splits, f4_diff, np.inf)
        f4_min = f4_masked.min()
        stage_b_mask = valid_splits & (f4_diff <= (f4_min + self.cfg.eps_team_diff))

        # Lexicographic selection on Objective 5 -> Objective 4 -> Objective 1
        q_idx, s_idx = np.nonzero(stage_b_mask)
        order = np.lexsort((
            -f1_surv[q_idx],              # Tie-break 2: Highest wait sum
            f4_diff[q_idx, s_idx],        # Tie-break 1: Lowest team imbalance
            f5_var[q_idx, s_idx],         # Primary: Lowest partner/opponent redundancy
        ))
        best_q, best_s = q_idx[order[0]], s_idx[order[0]]

        # Map local candidate indices back to global player IDs
        chosen_local = Q_surv[best_q]
        t1_local = (chosen_local[SPLIT_U1[best_s]], chosen_local[SPLIT_V1[best_s]])
        t2_local = (chosen_local[SPLIT_U2[best_s]], chosen_local[SPLIT_V2[best_s]])

        return MatchAssignment(
            team_1=(int(cand_idx[t1_local[0]]), int(cand_idx[t1_local[1]])),
            team_2=(int(cand_idx[t2_local[0]]), int(cand_idx[t2_local[1]])),
            metrics={
                "wait_sum": float(f1_surv[best_q]),
                "virt_games_sum": float(f2_surv[best_q]),
                "cohort_skill_var": float(f3_surv[best_q]),
                "team_rating_diff": float(f4_diff[best_q, best_s]),
                "redundancy_penalty": float(f5_var[best_q, best_s]),
            },
            relaxed_consecutive_rule=relaxed,
        )

```

---

## 7. Simulation Validation & Telemetry Metrics

To validate parameter tuning ($\epsilon_1, \dots, \epsilon_4, \omega, \gamma$) across synthetic or historical session logs, compare `VectorizedBadmintonMatcher` against **Strict FIFO** and **Lowest-Games-First** baselines across these seven telemetry metrics:

| Category | Telemetry Metric | Formula / Definition | Target Threshold |
| --- | --- | --- | --- |
| **Queue Fairness** | **Wait-Time Gini / Max Wait** | $\max_{i, r} w_i^{(r)}$ and standard deviation of wait times across completed rounds | Max wait $\le 1.25 \times \text{FIFO Max Wait}$ |
| **Queue Integrity** | **Priority Bypass Rate** | Fraction of selections where a player waiting longer than $1.5 \times \text{median wait}$ is bypassed | $< 5\%$ of games |
| **Participation Equity** | **Virtual Game Spread** | $\max_i g_i^{\text{virt}} - \min_i g_i^{\text{virt}}$ at session end (incorporating late arrivals) | $\le 1.0\text{ game}$ |
| **Constraint Compliance** | **Consecutive Limit Violations** | Count of games where `relaxed_consecutive_rule == True` while $N_{\text{avail}} \ge 8$ | Exactly $0$ |
| **Match Quality** | **Cohort Skill SD** | Mean of $\sqrt{f_3(q^*)}$ across all played games | $\ge 35\%$ reduction vs. FIFO |
| **Match Competitiveness** | **Weak-Link Team Diff** | Mean of $F_4(q^*, s^*)$ across all played games | $\le 0.40$ rating points |
| **Social Mixing** | **Repeat Partnership Rate** | Fraction of games where a partnered pair has already played together in the same session | $< 10\%$ for $N \ge 12$ |