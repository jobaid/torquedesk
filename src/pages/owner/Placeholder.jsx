import { Card, PageHeader } from './primitives'

export default function Placeholder({ title, body }) {
  return (
    <div>
      <PageHeader title={title} />
      <Card>
        <div style={{ color: '#8da2bf', fontSize: 13, lineHeight: 1.6 }}>{body}</div>
      </Card>
    </div>
  )
}
