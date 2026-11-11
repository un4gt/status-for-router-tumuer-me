import { createPortal } from 'react-dom';
import { useViewTransition } from './ViewTransition';

export function ViewModeSwitch({ mode, onChange, covered = false }: { mode: '2d' | '3d'; onChange: (mode: '2d' | '3d') => void; covered?: boolean }) {
	const { transitioning } = useViewTransition();
	return createPortal(
		<div className="view-mode-switch" data-mode={mode} data-covered={covered || undefined} role="group" aria-label="显示模式" aria-busy={transitioning}>
			{(['2d', '3d'] as const).map((value) => (
				<button
					key={value}
					type="button"
					aria-label={value === '3d' ? '3D 地球' : '2D'}
					title={value === '3d' ? '在 3D 地球上查看各地区链路' : '列表视图'}
					aria-pressed={mode === value}
					disabled={transitioning}
					onClick={() => mode !== value && onChange(value)}
				>
					{value.toUpperCase()}
				</button>
			))}
		</div>,
		document.body,
	);
}
