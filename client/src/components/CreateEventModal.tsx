import { useEffect, useState } from 'react'
import { useData } from '../data'
import type { EventInput } from '../services/api'
import { ArrowUpRight } from './Icons'
import Modal from './Modal'

const FALLBACK_CATEGORIES = ['Technology', 'Wellness', 'Music', 'Design', 'Culture', 'Food & Drink']

export default function CreateEventModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: EventInput) => Promise<void> }) {
  const { categories, refreshCategories } = useData()
  const [form, setForm] = useState({
    title: '',
    category: FALLBACK_CATEGORIES[0],
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    city: '',
    description: '',
    organizer: '',
    totalSeats: '50',
    price: '0',
    image: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void refreshCategories()
  }, [refreshCategories])

  const categoryOptions = categories.length ? categories.map(c => c.name) : FALLBACK_CATEGORIES
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }))
  const submit = async () => {
    setError('')
    if (!form.title.trim() || !form.date || !form.location.trim() || !form.city.trim() || !form.description.trim() || !form.organizer.trim()) {
      setError('Please complete all required fields.')
      return
    }
    setLoading(true)
    try {
      await onSubmit({
        ...form,
        totalSeats: Number(form.totalSeats),
        price: Number(form.price),
        image: form.image.trim() || undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit the event.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Create an event" onClose={onClose}>
      <p className="modal-lede">Your event will be saved to MongoDB and sent for admin review.</p>
      <label>
        Event title
        <input className="form-input" value={form.title} onChange={event => update('title', event.target.value)} />
      </label>
      <div className="form-row">
        <label>
          Category
          <select className="form-input" value={form.category} onChange={event => update('category', event.target.value)}>
            {categoryOptions.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input className="form-input" type="date" value={form.date} onChange={event => update('date', event.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Start time
          <input className="form-input" type="time" value={form.startTime} onChange={event => update('startTime', event.target.value)} />
        </label>
        <label>
          End time
          <input className="form-input" type="time" value={form.endTime} onChange={event => update('endTime', event.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Venue
          <input className="form-input" value={form.location} onChange={event => update('location', event.target.value)} />
        </label>
        <label>
          City
          <input className="form-input" value={form.city} onChange={event => update('city', event.target.value)} />
        </label>
      </div>
      <label>
        Organizer
        <input className="form-input" value={form.organizer} onChange={event => update('organizer', event.target.value)} />
      </label>
      <label>
        Description
        <textarea className="form-input" rows={3} value={form.description} onChange={event => update('description', event.target.value)} />
      </label>
      <div className="form-row">
        <label>
          Seats
          <input className="form-input" type="number" min="1" value={form.totalSeats} onChange={event => update('totalSeats', event.target.value)} />
        </label>
        <label>
          Price (Rs.)
          <input className="form-input" type="number" min="0" value={form.price} onChange={event => update('price', event.target.value)} />
        </label>
      </div>
      <label>
        Image URL (optional)
        <input className="form-input" type="url" placeholder="https://images.unsplash.com/..." value={form.image} onChange={event => update('image', event.target.value)} />
      </label>
      {form.image.trim() && (
        <div style={{ margin: '8px 0 12px', display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
          <img
            src={form.image}
            alt="Preview"
            style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, background: '#192233' }}
            onError={e => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <small style={{ color: '#8e98aa', fontSize: 11 }}>Live image preview</small>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button full-button" disabled={loading} onClick={submit}>
        {loading ? 'Submitting...' : 'Submit for review'} <ArrowUpRight size={16} />
      </button>
    </Modal>
  )
}

