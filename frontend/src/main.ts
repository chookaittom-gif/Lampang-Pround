/**
 * จุดเริ่ม frontend (แทน GAS include chain: style.html + javascript.html + inline script)
 * ลำดับ import สำคัญ: css → api shim (ติดตั้งตัวเองตอน import) → legacy app → legacy bootstrap
 */
import './styles/custom.css';
import './styles/tailwind.css';
import './api';
import { installLegacyGlobals } from './legacy/app';
import './legacy/bootstrap';

installLegacyGlobals();
