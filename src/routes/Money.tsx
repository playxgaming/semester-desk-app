import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Flame, Plus, Trash2 } from 'lucide-react'
import {
  Bar as RBar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Badge,
  Bar,
  Button,
  Card,
  Empty,
  Field,
  Modal,
  Note,
  PageHeader,
  Panel,
  Row,
  Select,
  Stat,
} from '@/components/ui'
import { AXIS, ChartTooltip } from '@/components/charts'
import {
  useBudgets,
  useHabitLogs,
  useHabits,
  useRecurring,
  useTransactions,
} from '@/hooks/data'
import {
  advanceRecurring,
  burnDown,
  byCategory,
  creepers,
  dueSoon,
  habitStreak,
  monthKey,
  monthLabel,
  rupees,
  SPEND_CATEGORIES,
} from '@/lib/money'
import { dayKey, prettyDay, relativeDue, today } from '@/lib/date'
import { patch, put, remove } from '@/db/mutate'
import { removeWithUndo } from '@/lib/undoable'
import { uid } from '@/lib/id'
import type { Budget, Habit, HabitLog, Recurring, Transaction } from '@/db/db'
import { useUi } from '@/store/ui'

const METHODS: Transaction['method'][] = ['upi', 'cash', 'card', 'other']

function previousMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 2, 1))
}

function QuickAdd({ month }: { month: string }) {
  const notify = useUi((s) => s.notify)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(SPEND_CATEGORIES[0])
  const [method, setMethod] = useState<Transaction['method']>('upi')
  const [note, setNote] = useState('')

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const value = Number(amount)
        if (!value || value <= 0) return
        await put('transactions', {
          id: uid(),
          user_id: null,
          updated_at: '',
          deleted_at: null,
          at: new Date().toISOString(),
          amount: value,
          category,
          method,
          note: note.trim(),
        } as Transaction)
        setAmount('')
        setNote('')
        notify(`${rupees(value)} logged to ${category}`)
      }}
    >
      <Field
        className="w-[130px]"
        label="Amount (₹)"
        type="number"
        min={1}
        step="0.01"
        inputMode="decimal"
        placeholder="120"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Select className="w-[150px]" label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
        {SPEND_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select
        className="w-[110px]"
        label="Paid by"
        value={method}
        onChange={(e) => setMethod(e.target.value as Transaction['method'])}
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {m.toUpperCase()}
          </option>
        ))}
      </Select>
      <Field
        className="min-w-[140px] flex-1"
        label="Note"
        placeholder="mess top-up"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" variant="primary">
        <Plus size={15} /> Add
      </Button>
      <span className="w-full text-[11.5px] text-ink-3">
        Two taps: amount and category. Everything else is optional. Logged to {monthLabel(month)}.
      </span>
    </form>
  )
}

function BudgetForm({ month, onDone }: { month: string; onDone: () => void }) {
  const [category, setCategory] = useState(SPEND_CATEGORIES[0])
  const [limit, setLimit] = useState(3000)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await put('budgets', {
          id: uid(),
          user_id: null,
          updated_at: '',
          deleted_at: null,
          month,
          category,
          limit_amount: limit,
        } as Budget)
        onDone()
      }}
    >
      <Row>
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {SPEND_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Field
          label={`Monthly limit for ${monthLabel(month)} (₹)`}
          type="number"
          min={0}
          step={100}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </Row>
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Set budget
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

function RecurringForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<Recurring>({
    id: uid(),
    user_id: null,
    updated_at: '',
    deleted_at: null,
    name: '',
    amount: 0,
    cadence: 'monthly',
    next_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  })
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.name.trim()) return
        await put('recurring', form)
        onDone()
      }}
    >
      <Row>
        <Field
          label="What"
          required
          placeholder="Mess fees"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Field
          label="Amount (₹)"
          type="number"
          min={0}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
        />
      </Row>
      <Row className="mt-3">
        <Select
          label="Cadence"
          value={form.cadence}
          onChange={(e) => setForm({ ...form, cadence: e.target.value as Recurring['cadence'] })}
        >
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="yearly">Yearly</option>
        </Select>
        <Field
          label="Next due"
          type="date"
          value={form.next_at.slice(0, 10)}
          onChange={(e) =>
            setForm({ ...form, next_at: new Date(`${e.target.value}T09:00:00`).toISOString() })
          }
        />
      </Row>
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

export default function Money() {
  const transactions = useTransactions()
  const month = monthKey()
  const budgets = useBudgets(month)
  const recurring = useRecurring()
  const habits = useHabits()
  const habitLogs = useHabitLogs()
  const [addingBudget, setAddingBudget] = useState(false)
  const [addingRecurring, setAddingRecurring] = useState(false)
  const [newHabit, setNewHabit] = useState('')

  const prev = previousMonth(month)
  const totals = useMemo(() => byCategory(transactions, month, prev), [transactions, month, prev])
  const spentThisMonth = totals.reduce((s, c) => s + c.amount, 0)
  const spentLastMonth = totals.reduce((s, c) => s + c.previous, 0)
  const grew = creepers(totals)
  const soon = dueSoon(recurring)
  const burn = budgets.map((b) => burnDown(b, transactions))
  const overPace = burn.filter((b) => b.status === 'over-pace' || b.status === 'blown')
  const blown = burn.filter((b) => b.status === 'blown')
  // headroom is what is actually still available; an overspent budget cannot
  // lend its negative balance to another one
  const headroom = burn.reduce((s, b) => s + Math.max(0, b.remaining), 0)
  const overspend = blown.reduce((s, b) => s + Math.abs(b.remaining), 0)

  const chartData = totals
    .filter((c) => c.amount > 0)
    .slice(0, 8)
    .map((c) => ({ category: c.category, amount: Math.round(c.amount), previous: Math.round(c.previous) }))

  const recent = transactions.slice(0, 12)

  return (
    <>
      <PageHeader
        eyebrow="Money and daily life"
        title="Money"
        lede={`${monthLabel(month)}. The number that matters mid-month is not what you have spent — it is whether you are spending faster than the month is passing.`}
      />

      <Card className="mb-5 p-4">
        <QuickAdd month={month} />
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={rupees(spentThisMonth)}
          label="Spent this month"
          hint={
            spentLastMonth
              ? `${spentThisMonth >= spentLastMonth ? '+' : '−'}${rupees(Math.abs(spentThisMonth - spentLastMonth))} vs ${monthLabel(prev).split(' ')[0]}`
              : 'no history yet'
          }
        />
        <Stat
          value={budgets.length ? rupees(headroom) : '—'}
          label="Budget headroom"
          tone={blown.length ? 'crit' : overPace.length ? 'warn' : budgets.length ? 'ok' : undefined}
          hint={
            budgets.length
              ? blown.length
                ? `${rupees(overspend)} over on ${blown.map((b) => b.category).join(', ')}`
                : `across ${budgets.length} budgets`
              : 'set one below'
          }
        />
        <Stat
          value={soon.length}
          label="Recurring due"
          hint={soon.length ? soon[0].name : 'nothing this week'}
          tone={soon.length ? 'warn' : undefined}
        />
        <Stat
          value={habits.filter((h) => habitStreak(h, habitLogs).doneToday).length}
          label="Habits done today"
          hint={`of ${habits.length}`}
        />
      </div>

      {overPace.length > 0 && (
        <Note tone={overPace.some((b) => b.status === 'blown') ? 'crit' : 'warn'} title="Burning too fast">
          {overPace.map((b) => (
            <p key={b.category} className="mb-1 last:mb-0">
              <b>{b.category}</b> — {b.message}
            </p>
          ))}
        </Note>
      )}

      {grew.length > 0 && (
        <Note tone="accent" title="Quietly growing">
          {grew.slice(0, 3).map((c) => (
            <p key={c.category} className="mb-1 last:mb-0">
              <b>{c.category}</b> is up {Math.round((c.delta ?? 0) * 100)}% on last month —{' '}
              {rupees(c.previous)} → {rupees(c.amount)}.
            </p>
          ))}
        </Note>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Budgets"
          sub={monthLabel(month)}
          action={
            <Button size="sm" onClick={() => setAddingBudget(true)}>
              <Plus size={13} /> Budget
            </Button>
          }
        >
          {burn.length ? (
            <ul className="space-y-4">
              {burn.map((b) => (
                <li key={b.category}>
                  <div className="mb-1 flex items-baseline gap-2">
                    <b className="text-[13.5px]">{b.category}</b>
                    <span className="font-mono text-[12px] text-ink-3 tabnum">
                      {rupees(b.spent)} / {rupees(b.limit)}
                    </span>
                    <Badge
                      className="ml-auto"
                      tone={
                        b.status === 'blown'
                          ? 'crit'
                          : b.status === 'over-pace'
                            ? 'warn'
                            : b.status === 'ahead'
                              ? 'ok'
                              : 'neutral'
                      }
                    >
                      {b.status.replace('-', ' ')}
                    </Badge>
                  </div>
                  {/* two bars, same scale: spend against the month elapsed */}
                  <Bar
                    value={b.used}
                    tone={b.status === 'blown' ? 'crit' : b.status === 'over-pace' ? 'warn' : 'ok'}
                  />
                  <div className="relative mt-1 h-3">
                    <div
                      className="absolute top-0 h-3 w-px bg-[color:var(--ink-3)]"
                      style={{ left: `${Math.min(100, b.elapsed * 100)}%` }}
                      title="How far through the month you are"
                    />
                    <span
                      className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink-3"
                      style={{ left: `${Math.min(94, Math.max(6, b.elapsed * 100))}%` }}
                    >
                      today
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-2">{b.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-ink-3">
              No budgets yet. One per category is enough — the burn-down compares what you have spent
              against how much of the month has passed.
            </p>
          )}
        </Panel>

        <Panel title="Where it went" sub={monthLabel(month)}>
          {chartData.length ? (
            <>
              <div style={{ height: chartData.length * 34 + 36 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 74, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke="var(--rule)" />
                    <XAxis type="number" {...AXIS} />
                    <YAxis type="category" dataKey="category" width={82} {...AXIS} />
                    <Tooltip
                      cursor={{ fill: 'var(--surface-2)' }}
                      content={
                        <ChartTooltip
                          format={(v, row) =>
                            `${rupees(Number(v))} this month · ${rupees(Number(row.previous ?? 0))} last`
                          }
                        />
                      }
                    />
                    <RBar
                      dataKey="amount"
                      fill="var(--accent)"
                      radius={[0, 4, 4, 0]}
                      barSize={14}
                      isAnimationActive={false}
                    >
                      <LabelList
                        dataKey="amount"
                        position="right"
                        formatter={(v: number) => rupees(v)}
                        style={{ fill: 'var(--ink-2)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      />
                    </RBar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11.5px] text-ink-3">
                Hover a bar to compare it with {monthLabel(prev)}.
              </p>
            </>
          ) : (
            <Empty title="Nothing logged this month">
              Add an expense above and this fills in.
            </Empty>
          )}
        </Panel>

        <Panel
          title="Recurring"
          action={
            <Button size="sm" onClick={() => setAddingRecurring(true)}>
              <Plus size={13} /> Add
            </Button>
          }
        >
          {recurring.length ? (
            <ul className="-my-1">
              {recurring.map((r) => {
                const rel = relativeDue(r.next_at)
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 border-b border-rule py-2.5 text-[13.5px] last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="font-mono text-[13px] tabnum">{rupees(r.amount)}</span>
                    <Badge tone={rel.days <= 2 ? 'warn' : 'neutral'}>{rel.label}</Badge>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await put('transactions', {
                          id: uid(),
                          user_id: null,
                          updated_at: '',
                          deleted_at: null,
                          at: new Date().toISOString(),
                          amount: r.amount,
                          category: 'Other',
                          method: 'upi',
                          note: r.name,
                        } as Transaction)
                        await patch('recurring', r.id, { next_at: advanceRecurring(r) })
                      }}
                    >
                      Paid
                    </Button>
                    <button
                      type="button"
                      aria-label={`Delete ${r.name}`}
                      className="icon-btn icon-btn-danger"
                      onClick={() => void removeWithUndo('recurring', r.id, r.name)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-[13.5px] text-ink-3">
              Mess fees, rent, subscriptions. Marking one paid logs the expense and rolls the date
              forward.
            </p>
          )}
        </Panel>

        <Panel title="Habits" sub={`${habits.length}`}>
          {habits.length ? (
            <ul className="space-y-3">
              {habits.map((h) => {
                const s = habitStreak(h, habitLogs)
                return (
                  <li key={h.id}>
                    <div className="mb-1 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Log ${h.name} for today`}
                        onClick={async () => {
                          const key = today()
                          const existing = habitLogs.find((l) => l.habit_id === h.id && l.date === key)
                          if (existing) await remove('habit_logs', existing.id)
                          else
                            await put('habit_logs', {
                              id: uid(),
                              user_id: null,
                              updated_at: '',
                              deleted_at: null,
                              habit_id: h.id,
                              date: key,
                              value: h.target,
                            } as HabitLog)
                        }}
                        className={clsx(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded border text-[15px] sm:h-6 sm:w-6 sm:text-[12px]',
                          s.doneToday
                            ? 'border-ok bg-[color:var(--ok-soft)] text-ok'
                            : 'border-rule text-ink-3 hover:border-rule-2',
                        )}
                      >
                        {s.doneToday ? '✓' : ''}
                      </button>
                      <b className="text-[13.5px]">{h.name}</b>
                      <span className="ml-auto inline-flex items-center gap-1 font-mono text-[12px] text-ink-3">
                        <Flame size={12} className={s.streak ? 'text-warn' : ''} />
                        {s.streak}d
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${h.name}`}
                        className="icon-btn icon-btn-danger"
                        onClick={() => void removeWithUndo('habits', h.id, h.name)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex gap-[2px]" role="img" aria-label={`${h.name}: ${Math.round(s.rate * 100)}% of the last 30 days`}>
                      {s.last30.map((d) => (
                        <span
                          key={d.date}
                          title={`${prettyDay(d.date)}: ${d.value >= h.target ? 'done' : 'missed'}`}
                          className="h-3 flex-1 rounded-[1px] border border-rule"
                          style={{
                            background:
                              d.value >= h.target ? 'var(--ok)' : 'var(--surface-2)',
                          }}
                        />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mb-3 text-[13.5px] text-ink-3">
              Daily targets with streaks. They share the day view with your study blocks, so the day is
              one picture.
            </p>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newHabit.trim()) return
              await put('habits', {
                id: uid(),
                user_id: null,
                updated_at: '',
                deleted_at: null,
                name: newHabit.trim(),
                cadence: 'daily',
                target: 1,
                colour: 'var(--ok)',
              } as Habit)
              setNewHabit('')
            }}
          >
            <input
              className="field py-1 text-[13px]"
              enterKeyHint="done"
              autoCapitalize="sentences"
              placeholder="Add a habit…"
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
            />
            <Button type="submit" size="sm">
              <Plus size={13} />
            </Button>
          </form>
        </Panel>

        <Panel title="Recent" sub={`${transactions.length} logged`} className="lg:col-span-2">
          {recent.length ? (
            <ul className="-my-1">
              {recent.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 border-b border-rule py-2 text-[13.5px] last:border-0"
                >
                  <span className="font-mono text-[11.5px] text-ink-3">
                    {t.at.slice(0, 10) === today() ? 'today' : prettyDay(dayKey(t.at))}
                  </span>
                  <Badge>{t.category}</Badge>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{t.note}</span>
                  <span className="chip">{t.method}</span>
                  <span className="font-mono text-[13px] tabnum">{rupees(t.amount)}</span>
                  <button
                    type="button"
                    aria-label="Delete expense"
                    className="icon-btn icon-btn-danger"
                    onClick={() => void removeWithUndo('transactions', t.id, t.note || t.category)}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No expenses yet">Two taps above and it starts paying for itself.</Empty>
          )}
        </Panel>
      </div>

      <Modal open={addingBudget} onClose={() => setAddingBudget(false)} title="Set a budget">
        <BudgetForm month={month} onDone={() => setAddingBudget(false)} />
      </Modal>
      <Modal open={addingRecurring} onClose={() => setAddingRecurring(false)} title="Add recurring payment">
        <RecurringForm onDone={() => setAddingRecurring(false)} />
      </Modal>
    </>
  )
}
