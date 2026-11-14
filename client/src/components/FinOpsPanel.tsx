import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { selectAgent } from '../digital-company/agentSelection'
import { setFinOpsOpen, subscribeFinOps } from '../digital-company/controlCenter'

interface Totals {
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  actualCost: number
  sessions: number
  apiCalls: number
}

type FinOps =
  | {
      available: true
      generatedAt: string
      periodDays: number
      fleet: Totals
      agents: Array<{ id: string; name: string; profile: string; totals: Totals | null; error?: string }>
      models: Array<{ model: string; inputTokens: number; outputTokens: number; estimatedCost: number; apiCalls: number; sessions: number }>
      daily: Array<{ day: string; apiCalls: number; inputTokens: number; outputTokens: number; estimatedCost: number }>
    }
  | { available: false; reason: string; generatedAt: string }

const PERIODS = [1, 7, 30]
const REFRESH_MS = 60000

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)))
const usd = (n: number) => (n === 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`)

const Panel = styled.section`
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1002;
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100vh - 36px);
  overflow-y: auto;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.97);
  border: 1px solid rgba(74, 222, 128, 0.45);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  font-size: 12px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);

  h2 {
    margin: 0;
    font-size: 16px;
    color: #86efac;
  }
  p {
    margin: 2px 0 0;
    color: #94a3b8;
  }
  button {
    border: 1px solid rgba(134, 239, 172, 0.5);
    border-radius: 8px;
    padding: 4px 9px;
    margin-left: 4px;
    color: #86efac;
    background: transparent;
    cursor: pointer;
  }
  button.active {
    color: #0f172a;
    background: #86efac;
  }
`

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 10px 16px;

  div {
    border-radius: 8px;
    padding: 6px;
    text-align: center;
    background: rgba(30, 41, 59, 0.8);
  }
  b {
    display: block;
    font-size: 17px;
  }
  span {
    font-size: 10px;
    color: #94a3b8;
  }
`

const Section = styled.div`
  padding: 8px 16px 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);

  h3 {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td,
  th {
    padding: 4px 2px;
    text-align: right;
    border-bottom: 1px dashed rgba(148, 163, 184, 0.15);
  }
  th {
    color: #94a3b8;
    font-weight: 600;
  }
  td:first-child,
  th:first-child {
    text-align: left;
  }
  tr.clickable {
    cursor: pointer;
  }
  tr.clickable:hover td {
    background: rgba(51, 65, 85, 0.6);
  }
`

const Note = styled.div`
  margin: 10px 16px;
  border-left: 3px solid #eab308;
  padding: 6px 8px;
  color: #fef08a;
  background: rgba(234, 179, 8, 0.1);
`

const Bar = styled.div<{ $pct: number }>`
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, #4ade80 ${({ $pct }) => $pct}%, rgba(51, 65, 85, 0.8) ${({ $pct }) => $pct}%);
`

/**
 * Piccolo's FinOps view: tokens, API calls and cost per agent and model, from
 * the Hermes Dashboard analytics (the same numbers as Hermes' Models page).
 * Never estimates or invents values; shows "unavailable" with the reason.
 */
export default function FinOpsPanel() {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(7)
  const [data, setData] = useState<FinOps | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeFinOps(setOpen), [])

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      try {
        const res = await fetch(`/api/digital-company/finops?days=${days}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as FinOps
        if (active) {
          setData(body)
          setError(null)
        }
      } catch (e) {
        if (active) setError((e as Error).message)
      }
    }
    setData(null)
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [open, days])

  if (!open) return null

  const maxDaily = data && data.available ? Math.max(1, ...data.daily.map((d) => d.apiCalls)) : 1

  return (
    <Panel aria-label="FinOps">
      <Header>
        <div>
          <h2>Piccolo · FinOps</h2>
          <p>Source: Hermes Dashboard analytics · last {days} day{days > 1 ? 's' : ''}</p>
        </div>
        <div>
          {PERIODS.map((p) => (
            <button key={p} type="button" className={p === days ? 'active' : ''} onClick={() => setDays(p)}>
              {p}d
            </button>
          ))}
          <button type="button" onClick={() => setFinOpsOpen(false)} title="Close">
            ✕
          </button>
        </div>
      </Header>

      {error && <Note>Office API error: {error}</Note>}
      {!error && !data && <Note>Loading…</Note>}
      {data && !data.available && <Note>FinOps data unavailable: {data.reason}</Note>}

      {data && data.available && (
        <>
          <Cards>
            <div>
              <b>{fmt(data.fleet.apiCalls)}</b>
              <span>API calls</span>
            </div>
            <div>
              <b>{fmt(data.fleet.inputTokens + data.fleet.outputTokens)}</b>
              <span>Tokens (in+out)</span>
            </div>
            <div>
              <b>{usd(data.fleet.estimatedCost)}</b>
              <span>Estimated cost</span>
            </div>
            <div>
              <b>{usd(data.fleet.actualCost)}</b>
              <span>Actual cost</span>
            </div>
          </Cards>

          <Note>
            Free OpenRouter models share one daily request limit per account, so all agents draw from the same
            quota. Watch the API calls per day below; the exact limit is shown in your OpenRouter account.
          </Note>

          <Section>
            <h3>API calls per day</h3>
            {data.daily.length ? (
              <table>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.day}>
                      <td style={{ width: 90 }}>{d.day}</td>
                      <td>
                        <Bar $pct={(d.apiCalls / maxDaily) * 100} />
                      </td>
                      <td style={{ width: 60 }}>{fmt(d.apiCalls)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span style={{ color: '#64748b' }}>No usage in this period.</span>
            )}
          </Section>

          <Section>
            <h3>By agent</h3>
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Calls</th>
                  <th>Tokens</th>
                  <th>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => selectAgent(a.id)}>
                    <td>{a.name}</td>
                    {a.totals ? (
                      <>
                        <td>{fmt(a.totals.apiCalls)}</td>
                        <td>{fmt(a.totals.inputTokens + a.totals.outputTokens)}</td>
                        <td>{usd(a.totals.estimatedCost)}</td>
                      </>
                    ) : (
                      <td colSpan={3} style={{ color: '#fca5a5' }}>
                        no data ({a.error || 'unavailable'})
                      </td>
                    )}
                  </tr>
                ))}
                {(() => {
                  const sum = data.agents.reduce((acc, a) => acc + (a.totals ? a.totals.apiCalls : 0), 0)
                  const rest = data.fleet.apiCalls - sum
                  const restTokens =
                    data.fleet.inputTokens + data.fleet.outputTokens -
                    data.agents.reduce((acc, a) => acc + (a.totals ? a.totals.inputTokens + a.totals.outputTokens : 0), 0)
                  return rest > 0 || restTokens > 0 ? (
                    <tr>
                      <td title="Default profile: Dashboard chat and direct hermes commands">Default profile</td>
                      <td>{fmt(Math.max(0, rest))}</td>
                      <td>{fmt(Math.max(0, restTokens))}</td>
                      <td>—</td>
                    </tr>
                  ) : null
                })()}
              </tbody>
            </table>
          </Section>

          <Section>
            <h3>By model</h3>
            {data.models.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Calls</th>
                    <th>Tokens</th>
                    <th>Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((m) => (
                    <tr key={m.model}>
                      <td style={{ wordBreak: 'break-all' }}>{m.model}</td>
                      <td>{fmt(m.apiCalls)}</td>
                      <td>{fmt(m.inputTokens + m.outputTokens)}</td>
                      <td>{usd(m.estimatedCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span style={{ color: '#64748b' }}>No model usage in this period.</span>
            )}
          </Section>
        </>
      )}
    </Panel>
  )
}
