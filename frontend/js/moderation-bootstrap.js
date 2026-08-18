import { initModerationUi } from './moderation-ui.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initModerationUi(), { once: true });
} else {
    initModerationUi();
}
