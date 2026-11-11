import { useEffect, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { fetchProbeDetail, type ProbeDetail, type WindowKey } from '../../api';
import { formatLatency as latencyLabel } from '../../format';
import { ArrowLeftIcon, ArrowRightIcon } from './icons';

const timeLabel = (time: number, date = false) =>
	new Date(time).toLocaleString(
		'zh-CN',
		date
			? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
			: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
	);

function PercentileChart({ detail }: { detail: ProbeDetail }) {
	const width = 320,
		height = 144,
		left = 8,
		top = 22,
		bottom = 24;
	const max = Math.max(1, ...detail.series.flatMap((point) => [point.p95_ms ?? 0, point.p99_ms ?? 0]));
	const x = (ts: number) => left + Math.max(0, (ts - detail.from) / (detail.to - detail.from)) * (width - left * 2);
	const y = (ms: number) => top + (1 - ms / max) * (height - top - bottom);
	const path = (key: 'p95_ms' | 'p99_ms') => {
		let previous = false;
		return detail.series
			.map((point) => {
				if (point[key] === null) {
					previous = false;
					return '';
				}
				const command = `${previous ? 'L' : 'M'}${x(point.ts).toFixed(1)},${y(point[key]).toFixed(1)}`;
				previous = true;
				return command;
			})
			.join(' ');
	};
	return (
		<svg
			className="globe-chart"
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={`成功请求 P95 ${latencyLabel(detail.p95_ms)}，P99 ${latencyLabel(detail.p99_ms)}。缺失样本处断开。`}
		>
			{[0, 0.5, 1].map((ratio) => (
				<line key={ratio} x1={left} x2={width - left} y1={y(max * ratio)} y2={y(max * ratio)} stroke="var(--g-line)" />
			))}
			<text x={left} y={12}>
				{latencyLabel(max)}
			</text>
			<path d={path('p99_ms')} fill="none" stroke="var(--g-text-3)" strokeWidth="1.6" strokeDasharray="4 3" />
			<path d={path('p95_ms')} fill="none" stroke="var(--g-brand)" strokeWidth="2" />
			{detail.series
				.filter((point) => point.p95_ms !== null)
				.map((point) => (
					<circle key={point.ts} cx={x(point.ts)} cy={y(point.p95_ms!)} r="2.5" fill="var(--g-brand)">
						<title>
							{timeLabel(point.ts, true)} · P95 {latencyLabel(point.p95_ms)} · P99 {latencyLabel(point.p99_ms)} · n={point.sample_count}
						</title>
					</circle>
				))}
			<text x={left} y={height - 4}>
				{timeLabel(detail.from, true)}
			</text>
			<text x={width - left} y={height - 4} textAnchor="end">
				{timeLabel(detail.to, true)}
			</text>
			{!detail.sample_count && (
				<text x={width / 2} y={75} textAnchor="middle">
					此时间段没有成功请求耗时
				</text>
			)}
		</svg>
	);
}

export default function ProbePanel({
	checkId,
	region,
	windowKey,
	revision,
	source,
}: {
	checkId: string;
	region: string;
	windowKey: WindowKey;
	revision: number;
	source: 'network' | 'model';
}) {
	const [state, setState] = useState<{ key: string; data?: ProbeDetail; error?: string } | null>(null);
	const [tab, setTab] = useState<'chart' | 'history'>('chart');
	const [page, setPage] = useState(0);
	const [retry, setRetry] = useState(0);
	const short = useMediaQuery('(max-height: 650px)');
	const veryShort = useMediaQuery('(max-height: 500px)');
	const pageSize = veryShort ? 2 : short ? 3 : 4;
	const key = `${checkId}|${region}|${windowKey}|${revision}|${retry}`;
	const current = state?.key === key ? state : null;
	useEffect(() => {
		setPage(0);
		if (!checkId) return;
		const controller = new AbortController();
		let disposed = false;
		const timer = window.setTimeout(() => controller.abort(), 15_000);
		fetchProbeDetail(checkId, region, windowKey, controller.signal)
			.then((data) => {
				if (!disposed) setState({ key, data });
			})
			.catch(() => {
				if (!disposed) setState({ key, error: '这个地区的检测明细暂时无法读取。' });
			})
			.finally(() => window.clearTimeout(timer));
		return () => {
			disposed = true;
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [key]);
	if (!checkId) return <p className="globe-empty">尚未配置{source === 'network' ? '网关检测' : '模型检测'}。</p>;
	if (current?.error)
		return (
			<div role="alert" className="globe-empty">
				{current.error}
				<button onClick={() => setRetry((n) => n + 1)}>重试</button>
			</div>
		);
	if (!current?.data)
		return (
			<p role="status" className="globe-empty">
				正在读取检测明细…
			</p>
		);
	const detail = current.data;
	const currentPage = Math.min(page, Math.max(0, Math.ceil(detail.history.length / pageSize) - 1));
	return (
		<section className="probe-panel">
			<div className="globe-percentiles">
				<div>
					<span>
						P95 <i className="chart-key p95" />
					</span>
					<strong>{latencyLabel(detail.p95_ms)}</strong>
				</div>
				<div>
					<span>
						P99 <i className="chart-key p99" />
					</span>
					<strong>{latencyLabel(detail.p99_ms)}</strong>
				</div>
				<div>
					<span>成功率</span>
					<strong>{detail.availability === null ? '—' : `${(detail.availability * 100).toFixed(1)}%`}</strong>
				</div>
			</div>
			<div className="globe-segments detail-tabs" role="group" aria-label="详情内容">
				<button aria-pressed={tab === 'chart'} onClick={() => setTab('chart')}>
					延迟趋势
				</button>
				<button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
					最近检测 <span>{detail.history.length}</span>
				</button>
			</div>
			{tab === 'chart' ? (
				<>
					<PercentileChart detail={detail} />
					<p className="globe-note">
						只统计成功请求的耗时（{detail.sample_count} 个样本，每 {Math.round(detail.bucket_ms / 60000)} 分钟一组）；样本少时 P95 与 P99 可能重合。
					</p>
				</>
			) : (
				<>
					<table className="globe-history">
						<caption>所选时间段内最近 {detail.history.length} 次检测</caption>
						<thead>
							<tr>
								<th>时间</th>
								<th>结果</th>
								<th>耗时</th>
							</tr>
						</thead>
						<tbody>
							{detail.history.slice(currentPage * pageSize, currentPage * pageSize + pageSize).map((row, index) => (
								<tr key={`${row.ts}-${index}`}>
									<td title={timeLabel(row.ts, true)}>{timeLabel(row.ts)}</td>
									<td className={row.success ? 'text-healthy' : 'text-outage'}>
										{row.success ? '成功' : '失败'} <small>{row.status_code ?? '超时或连接失败'}</small>
									</td>
									<td>{latencyLabel(row.latency_ms)}</td>
								</tr>
							))}
						</tbody>
					</table>
					{!detail.history.length && <p className="globe-note">没有检测记录。</p>}
					<div className="globe-pagination">
						<button disabled={!currentPage} onClick={() => setPage(currentPage - 1)} aria-label="上一页历史">
							<ArrowLeftIcon />
						</button>
						<span>
							{currentPage + 1} / {Math.max(1, Math.ceil(detail.history.length / pageSize))}
						</span>
						<button
							disabled={(currentPage + 1) * pageSize >= detail.history.length}
							onClick={() => setPage(currentPage + 1)}
							aria-label="下一页历史"
						>
							<ArrowRightIcon />
						</button>
					</div>
				</>
			)}
		</section>
	);
}
