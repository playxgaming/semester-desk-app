import { useState } from 'react'
import { PageHeader, Card, Button, TextArea, Select, Row } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { Loader2, Send } from 'lucide-react'
import { aiRequest } from '@/lib/ai'

export default function Tutor() {
  const [problem, setProblem] = useState('')
  const [subject, setSubject] = useState('Maths')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSolve = async () => {
    if (!problem.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)

    try {
      const result = await aiRequest<unknown>('solve-problem', { problem: problem.trim(), subject })
      if (typeof result !== 'string' || !result.trim()) throw new Error('No solution returned. Try rephrasing the question.')
      setAnswer(result)
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="AI Tutor"
        title="Q&A Solver"
        lede="Work through a problem step by step. AI answers need an internet connection; check the reasoning before relying on it."
      />

      <Card className="p-4 mb-6">
        <Row className="mb-4">
          <Select 
            label="Subject" 
            value={subject} 
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="Maths">Mathematics</option>
            <option value="Physics">Physics</option>
            <option value="Chemistry">Chemistry</option>
            <option value="Computer Science">Computer Science</option>
            <option value="General Logic">General Logic</option>
          </Select>
        </Row>
        
        <TextArea 
          label="What's the problem?"
          placeholder="e.g. Integrate x^2 * sin(x) dx"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          rows={4}
          maxLength={8000}
          disabled={loading}
        />

        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={handleSolve} disabled={!problem.trim() || loading}>
            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Send size={16} className="mr-2" />}
            {loading ? 'Solving...' : 'Solve'}
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-crit text-crit mb-6">
          <div role="alert">
          {error}
          </div>
        </Card>
      )}

      {answer && (
        <Card className="p-6 bg-surface-2 border-accent">
          <h3 className="text-[14px] font-semibold text-accent mb-4 uppercase tracking-wider">Solution</h3>
          <div className="text-[15px]">
            <Markdown source={answer} />
          </div>
        </Card>
      )}
    </>
  )
}
