import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Heart, MapPin } from './Icons'
import type { Event } from '../types'

function formatDate(date: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`))
  } catch {
    return date
  }
}

export default function EventCard({ event, onSelect }: { event: Event; onSelect: (event: Event) => void }) {
  const [saved, setSaved] = useState(false)
  const [imgError, setImgError] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(event)
    }
  }

  return (
    <article
      className="event-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={handleKeyDown}
      aria-label={`View details for ${event.title}`}
    >
      <div className="event-image-wrap">
        {event.image && !imgError ? (
          <img src={event.image} alt={event.title} onError={() => setImgError(true)} loading="lazy" />
        ) : (
          <div className="event-fallback-image">
            <span>{event.category?.slice(0, 1) || 'E'}</span>
          </div>
        )}
        <span className="category-pill">{event.category}</span>
        <button
          type="button"
          className={saved ? 'circle-button image-heart saved' : 'circle-button image-heart'}
          aria-label={saved ? 'Remove from saved events' : 'Save event to favorites'}
          onClick={e => {
            e.stopPropagation()
            setSaved(!saved)
          }}
        >
          <Heart size={15} fill={saved ? '#ff9cc7' : 'none'} color={saved ? '#ff9cc7' : 'currentColor'} />
        </button>
      </div>
      <div className="event-card-body">
        <div className="event-card-heading">
          <h3>{event.title}</h3>
          <span className="arrow-circle">
            <ArrowUpRight size={16} />
          </span>
        </div>
        <p className="muted clamp">{event.description}</p>
        <div className="event-meta">
          <span>
            <CalendarDays size={14} />
            {formatDate(event.date)}
          </span>
          <span>
            <MapPin size={14} />
            {event.city}
          </span>
        </div>
        <div className="card-footer">
          <span className="availability">
            <i />
            {event.seats} spots left
          </span>
          <span className="price">
            Rs. {event.price.toLocaleString('en-IN')} <small>/ person</small>
          </span>
        </div>
      </div>
    </article>
  )
}



