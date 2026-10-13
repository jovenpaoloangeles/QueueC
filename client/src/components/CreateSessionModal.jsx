import { useState } from 'react'
import { createSession } from '../api.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function toUnix(dateStr, timeStr) {
  return Math.floor(new Date(`${dateStr}T${timeStr}`).getTime() / 1000)
}

const today = new Date().toISOString().split('T')[0]

export default function CreateSessionModal({ onClose }) {
  const [form, setForm] = useState({ name: 'Evening Session', date: today, start: '18:00', end: '21:00', courts: 2 })
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    await createSession({
      name: form.name,
      scheduled_start: toUnix(form.date, form.start),
      scheduled_end: toUnix(form.date, form.end),
      court_count: Number(form.courts)
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3 text-xs">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} required />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>Start</Label>
              <Input type="time" value={form.start} onChange={e => setForm(f => ({...f, start: e.target.value}))} required />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>End</Label>
              <Input type="time" value={form.end} onChange={e => setForm(f => ({...f, end: e.target.value}))} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Courts</Label>
            <Input type="number" min="1" max="10" value={form.courts} onChange={e => setForm(f => ({...f, courts: e.target.value}))} required />
          </div>
          <div className="flex gap-2 justify-end mt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? '...' : 'Start Session'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
