import { Component, type ReactNode } from 'react';

export class GlobeGuard extends Component<{ children: ReactNode; onFallback: (reason: string) => void }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch() {
		this.props.onFallback('3D 视图加载或渲染失败，已恢复 2D 视图。');
	}
	render() {
		return this.state.failed ? null : this.props.children;
	}
}
