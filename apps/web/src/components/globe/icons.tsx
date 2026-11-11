/** 3D toolbar glyphs, from the site's single icon set (see design/icons.tsx). */
import { ArrowLeft, ArrowRight, CircleHelp, Crosshair, Icon, Pause, Play, RefreshCw, X } from '../../design/icons';

export const RecenterIcon = () => <Icon icon={Crosshair} size={18} />;
export const PauseIcon = () => <Icon icon={Pause} size={18} />;
export const PlayIcon = () => <Icon icon={Play} size={18} />;
export const RefreshIcon = () => <Icon icon={RefreshCw} size={18} />;
export const HelpIcon = () => <Icon icon={CircleHelp} size={18} />;
export const CloseIcon = () => <Icon icon={X} size={18} />;
export const ArrowLeftIcon = () => <Icon icon={ArrowLeft} size={14} />;
export const ArrowRightIcon = () => <Icon icon={ArrowRight} size={14} />;
