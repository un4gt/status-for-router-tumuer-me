import { useEffect, useMemo, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { OverviewResponse, WindowKey } from '../../api';
import { WINDOWS } from '../../constants';
import { TIER_COLORS, TIER_LABELS } from '../../latency';
import GlobeCanvas from './GlobeCanvas';
import ProbePanel from './ProbePanel';
import { buildGlobeData, COLORS, LABELS, latencyLabel, type GlobeArc, type Layer } from './globeData';
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
					<h1>全球拨测</h1>
					<span>
						{data.nodes.length} 个地区 · {models} 个模型同时观测
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
						Globalping
					</button>
					<button aria-pressed={layer === 'model'} onClick={() => setLayer('model')}>
						<i className="model-dot" />
						模型 HTTP
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
					{overview?.mode === 'mock' ? '模拟数据' : overview?.mode === 'direct' ? '直连测试数据' : '实时拨测'} ·{' '}
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
				<button onClick={reset} title="恢复太平洋全景" aria-label="恢复全景">
					⌖
				</button>
				<button onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? '播放动画' : '暂停动画'}>
					{paused ? '▷' : 'Ⅱ'}
				</button>
				<button onClick={onRefresh} disabled={refreshing} aria-label="刷新监控数据">
					↻
				</button>
				<button
					onClick={() => {
						setHelp(!help);
						setSelected(null);
					}}
					aria-expanded={help}
					aria-label="操作说明"
				>
					?
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
							×
						</button>
					</div>
					{check ? (
						<>
							<button className="globe-back" onClick={() => setCheckId(null)}>
								← 全部 {node.checks.length} 个检查项
							</button>
							<div className="globe-check-heading">
								<span>{check.layer === 'network' ? 'Globalping HTTP' : '模型 HTTP'}</span>
								<h3>{check.label}</h3>
								<p style={{ color: COLORS[check.signal.status] }}>
									{LABELS[check.signal.status]} · 最近 {latencyLabel(check.signal.latency)}
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
							<p className="globe-note">所有端点与模型均已在地球上同时显示。点击下面任一检查项查看趋势。</p>
							<div className="globe-check-list">
								{node.checks.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((item) => (
									<button key={item.checkId} onClick={() => setCheckId(item.checkId)}>
										<i style={{ background: COLORS[item.signal.status] }} />
										<span>
											<small>{item.layer === 'network' ? 'Globalping' : '模型 HTTP'}</small>
											<strong>{item.label}</strong>
										</span>
										<span className="globe-check-value" style={{ color: COLORS[item.signal.status] }}>
											{latencyLabel(item.signal.latency)}
											<small>{LABELS[item.signal.status]}</small>
										</span>
									</button>
								))}
							</div>
							{node.checks.length === 0 && <p className="globe-note">尚无检查项。</p>}
							{node.checks.length > pageSize && (
								<div className="globe-pagination">
									<button disabled={!currentPage} onClick={() => setPage(currentPage - 1)} aria-label="上一页检查项">
										←
									</button>
									<span>
										{currentPage + 1} / {Math.ceil(node.checks.length / pageSize)}
									</span>
									<button
										disabled={(currentPage + 1) * pageSize >= node.checks.length}
										onClick={() => setPage(currentPage + 1)}
										aria-label="下一页检查项"
									>
										→
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
							×
						</button>
					</div>
					<p>
						左键 / 中键拖动旋转 · Shift＋拖动或右键平移 ·
						Ctrl＋拖动或滚轮缩放。单击节点查看该地区所有模型；悬停飞线查看模型名，单击直达该链路详情。
					</p>
					<p>低层飞线为 Globalping HTTP，高层为各模型真实请求。所有启用模型同时显示，互不混算；同城探测显示在节点详情中。</p>
					<p>
						飞线按请求延迟分级：小于 800ms 绿色、小于 2s 黄色、小于 10s 红色，10s
						及以上或无新数据为灰色；请求失败至少标红。弧线高度用来区分检查项，不代表真实路由。
					</p>
					<p>
						正常链路保留完整底线，亮段由探测节点流向目标，耗时越高移动越慢；故障和无新数据以断线显示并停止流动。底部按钮控制播放与暂停。Globalping
						是 HTTP 耗时，不是 ICMP RTT，也不推测丢包率。
					</p>
					<p>
						地球获得焦点后：数字键 1 / 3 / 7 切换前 / 右 / 顶视图，Ctrl 切换反向；5 切换正交投影，9 反向，Home 恢复全景，方向键旋转，＋/−
						缩放，H 隐藏标签，Space 暂停，R 刷新，[ / ] 切换地区，. 聚焦，/ 局部视图。
					</p>
					<a href="https://www.figma.com/make/iO1ad5wy1hFhojTQ2dRyet/Polish-2D-and-3D-Status-Views" target="_blank" rel="noreferrer">
						Figma Make 设计来源
					</a>
				</aside>
			)}
		</div>
	);
}
