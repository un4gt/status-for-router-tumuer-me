import { useEffect, useMemo, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { OverviewResponse, WindowKey } from '../../api';
import { TYPE_LABELS, WINDOWS } from '../../constants';
import { formatLatency } from '../../format';
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, HelpIcon, PauseIcon, PlayIcon, RecenterIcon, RefreshIcon } from './icons';
import { Globe, Icon } from '../../design/icons';
import { ModelIcon } from '../ModelIcon';
import { TIER_COLORS, TIER_LABELS } from '../../latency';
import GlobeCanvas from './GlobeCanvas';
import ProbePanel from './ProbePanel';
import { buildGlobeData, COLORS, LABELS, type GlobeArc, type Layer } from './globeData';
import './globe.css';

type Props = {
	active: boolean;
	overview: OverviewResponse | null;
	windowKey: WindowKey;
	error: string | null;
	refreshing: boolean;
	onWindowChange: (window: WindowKey) => void;
	onRefresh: () => void;
	onExit: () => void;
	onFallback: (reason: string) => void;
};

export default function GlobeStatusView({
	active,
	overview,
	windowKey,
	error,
	refreshing,
	onWindowChange,
	onRefresh,
	onExit,
	onFallback,
}: Props) {
	const [layer, setLayer] = useState<Layer>('both');
	const [selected, setSelected] = useState<string | null>(null);
	const [checkId, setCheckId] = useState<string | null>(null);
	const [focusTick, setFocusTick] = useState(0);
	const [paused, setPaused] = useState(false);
	const [now, setNow] = useState(Date.now());
	const [help, setHelp] = useState(false);
	const [page, setPage] = useState(0);
	const short = useMediaQuery('(max-height: 650px)');
	const pageSize = short ? 4 : 8;
	useEffect(() => {
		if (!active) return;
		const timer = window.setInterval(() => setNow(Date.now()), 15_000);
		return () => window.clearInterval(timer);
	}, [active]);
	useEffect(() => {
		if (overview && !overview.topology) onFallback('服务器尚未提供 3D 地理信息，请更新后端；已返回 2D。');
	}, [overview, onFallback]);
	const data = useMemo(
		() => (overview?.topology ? buildGlobeData(overview, layer, now) : { nodes: [], arcs: [], unmapped: [] }),
		[overview, layer, now],
	);
	const node = data.nodes.find((item) => item.id === selected);
	const check = node?.checks.find((item) => item.checkId === checkId);
	const choose = (id: string) => {
		setSelected(id);
		setCheckId(null);
		setPage(0);
		setHelp(false);
		setFocusTick((n) => n + 1);
	};
	const chooseArc = (arc: GlobeArc) => {
		choose(arc.node.id);
		setCheckId(arc.checkId);
	};
	const reset = () => {
		setSelected(null);
		setCheckId(null);
		setFocusTick((n) => n + 1);
	};
	const models = overview?.models.filter((item) => item.enabled).length ?? 0;
	const currentPage = Math.min(page, Math.max(0, Math.ceil((node?.checks.length ?? 0) / pageSize) - 1));
	return (
		<div className="globe-page">
			{overview?.topology ? (
				<GlobeCanvas
					active={active}
					nodes={data.nodes}
					arcs={data.arcs}
					target={overview.topology.target}
					selected={selected}
					focusTick={focusTick}
					paused={paused}
					onSelect={choose}
					onArcSelect={chooseArc}
					onFallback={onFallback}
					onTogglePause={() => setPaused((p) => !p)}
					onRefresh={onRefresh}
					onExit={onExit}
					onHelp={() => setHelp((h) => !h)}
				/>
			) : (
				<div className="globe-loading" role="status">
					{error ? '等待数据恢复' : '正在加载地球…'}
				</div>
			)}

			<div className="globe-topline">
				<div className="globe-title">
					<h1>全球检测链路</h1>
					<span>
						{data.nodes.length} 个地区 · {models} 个模型
					</span>
				</div>
			</div>
			{error && (
				<div className="globe-error" role="alert">
					{error}
				</div>
			)}

			<div className="globe-caption">
				<div className="globe-layers" role="group" aria-label="链路图层">
					<button aria-pressed={layer === 'both'} onClick={() => setLayer('both')}>
						全部链路
					</button>
					<button aria-pressed={layer === 'network'} onClick={() => setLayer('network')}>
						<i className="network-dot" />
						网关检测
					</button>
					<button aria-pressed={layer === 'model'} onClick={() => setLayer('model')}>
						<i className="model-dot" />
						模型检测
					</button>
				</div>
				<div className="globe-latency-legend">
					{Object.entries(TIER_LABELS).map(([tier, label]) => (
						<span key={tier}>
							<i style={{ background: TIER_COLORS[tier as keyof typeof TIER_COLORS] }} />
							{label}
						</span>
					))}
				</div>
				<span className="globe-data-note">
					{overview?.mode === 'mock' ? '模拟数据' : overview?.mode === 'direct' ? '直连测试数据' : '实时检测'} · 数据时间{' '}
					{overview ? new Date(overview.generated_at).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}
					{data.unmapped.length > 0 && <span> · {data.unmapped.length} 个地区无坐标</span>}
				</span>
			</div>
			<div className="globe-tools">
				<select aria-label="定位地区" value={selected ?? ''} onChange={(e) => (e.target.value ? choose(e.target.value) : reset())}>
					<option value="">定位地区</option>
					{data.nodes.map((item) => (
						<option key={item.id} value={item.id}>
							{item.label}
						</option>
					))}
				</select>
				<button onClick={reset} title="回到全景" aria-label="恢复全景">
					<RecenterIcon />
				</button>
				<button onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? '播放动画' : '暂停动画'} title={paused ? '播放动画' : '暂停动画'}>
					{paused ? <PlayIcon /> : <PauseIcon />}
				</button>
				<button onClick={onRefresh} disabled={refreshing} aria-label="刷新监控数据" title="刷新数据">
					<RefreshIcon />
				</button>
				<button
					onClick={() => {
						setHelp(!help);
						setSelected(null);
					}}
					aria-expanded={help}
					aria-label="操作说明"
					title="操作说明"
				>
					<HelpIcon />
				</button>
			</div>

			{node && (
				<aside className="globe-inspector" aria-label={node.label + '地区详情'}>
					<div className="globe-detail-heading">
						<div>
							<span>
								{node.code} → {overview?.topology.target.label}
							</span>
							<h2>{node.label}</h2>
						</div>
						<button
							onClick={() => {
								setSelected(null);
								setCheckId(null);
							}}
							aria-label="关闭地区详情"
						>
							<CloseIcon />
						</button>
					</div>
					{check ? (
						<>
							<button className="globe-back" onClick={() => setCheckId(null)}>
								<ArrowLeftIcon /> 全部 {node.checks.length} 项
							</button>
							<div className="globe-check-heading">
								<span>{check.layer === 'network' ? '网关检测 · Globalping' : '模型检测 · 云函数'}</span>
								<h3>{check.label}</h3>
								<p style={{ color: COLORS[check.signal.status] }}>
									{LABELS[check.signal.status]} · 最近 {formatLatency(check.signal.latency)}
								</p>
							</div>
							<label className="globe-range">
								统计范围
								<select aria-label="统计范围" value={windowKey} onChange={(e) => onWindowChange(e.target.value as WindowKey)}>
									{WINDOWS.map((item) => (
										<option key={item.key} value={item.key}>
											{item.label}
										</option>
									))}
								</select>
							</label>
							<ProbePanel
								checkId={check.checkId}
								region={node.id}
								windowKey={windowKey}
								revision={overview!.generated_at}
								source={check.layer}
							/>
						</>
					) : (
						<>
							<p className="globe-note">点击任一项查看该地区的延迟趋势和最近检测。</p>
							<div className="globe-check-list">
								{node.checks.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((item) => (
									<button key={item.checkId} onClick={() => setCheckId(item.checkId)}>
										<span className="globe-check-icon">
											{item.model ? <ModelIcon model={item.model} size={24} withTooltip={false} /> : <Icon icon={Globe} size={16} />}
											<i style={{ background: COLORS[item.signal.status] }} />
										</span>
										<span>
											<small>{item.layer === 'network' ? '网关' : item.type ? TYPE_LABELS[item.type] : '模型'}</small>
											<strong>{item.label}</strong>
										</span>
										<span className="globe-check-value" style={{ color: COLORS[item.signal.status] }}>
											{formatLatency(item.signal.latency)}
											<small>{LABELS[item.signal.status]}</small>
										</span>
									</button>
								))}
							</div>
							{node.checks.length === 0 && <p className="globe-note">尚无检查项。</p>}
							{node.checks.length > pageSize && (
								<div className="globe-pagination">
									<button disabled={!currentPage} onClick={() => setPage(currentPage - 1)} aria-label="上一页检查项">
										<ArrowLeftIcon />
									</button>
									<span>
										{currentPage + 1} / {Math.ceil(node.checks.length / pageSize)}
									</span>
									<button
										disabled={(currentPage + 1) * pageSize >= node.checks.length}
										onClick={() => setPage(currentPage + 1)}
										aria-label="下一页检查项"
									>
										<ArrowRightIcon />
									</button>
								</div>
							)}
						</>
					)}
				</aside>
			)}

			{help && (
				<aside className="globe-inspector globe-help" aria-label="操作说明">
					<div className="globe-detail-heading">
						<h2>操作说明</h2>
						<button onClick={() => setHelp(false)} aria-label="关闭说明">
							<CloseIcon />
						</button>
					</div>
					<dl className="globe-help-list">
						<dt>怎么看</dt>
						<dd>每条飞线是一个地区到服务目标的一次检测。低层是网关检测，高层是各模型请求；线的高度只用来区分检测项，不代表真实路由。</dd>
						<dt>颜色</dt>
						<dd>按请求耗时分级：绿色 &lt; 800 ms，黄色 &lt; 2 s，红色 &lt; 10 s，灰色为 ≥ 10 s 或没有新数据。请求失败至少显示为红色并断开。</dd>
						<dt>鼠标</dt>
						<dd>拖动旋转，滚轮缩放，Shift + 拖动或右键平移；点击地区查看明细，悬停飞线查看模型名。</dd>
						<dt>键盘</dt>
						<dd>Home 回到全景，方向键旋转，+ / − 缩放，[ / ] 切换地区，Space 暂停，R 刷新，H 隐藏标签。</dd>
					</dl>
				</aside>
			)}
		</div>
	);
}
