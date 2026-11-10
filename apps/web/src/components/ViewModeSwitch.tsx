import { createPortal } from 'react-dom';
import { useViewTransition } from './ViewTransition';

export function ViewModeSwitch({ mode, onChange }: { mode: '2d' | '3d'; onChange: (mode: '2d' | '3d') => void }) {
	const { transitioning } = useViewTransition();
	return createPortal(
		<div className="view-mode-switch" data-mode={mode} role="group" aria-label="显示模式" aria-busy={transitioning}>
			{(['2d', '3d'] as const).map((value) => (
				<button
					key={value}
					type="button"
					aria-label={value === '3d' ? '3D 地球' : '2D'}
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
