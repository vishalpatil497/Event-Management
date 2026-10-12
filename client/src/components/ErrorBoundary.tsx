import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Ticket } from './Icons'

type Props = { children: ReactNode }
type State = { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Something went wrong.' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => {
    this.setState({ hasError: false, message: '' })
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell" style={{ placeItems: 'center', display: 'grid' }}>
          <div className="empty-state glass-panel" style={{ maxWidth: 520, width: '100%', margin: 32 }}>
            <Ticket size={28} />
            <strong>Something broke.</strong>
            <p className="muted" style={{ margin: '12px 0 0', textAlign: 'center' }}>
              {this.state.message || 'The app hit an unexpected error. Please reload to continue.'}
            </p>
            <button className="primary-button" style={{ marginTop: 20 }} onClick={this.reset}>
              Reload Gatherly
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
