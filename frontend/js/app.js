import { apiFetch, notify, showFormModal, getGeolocation } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, loadConversations, setCurrentUserId } from './chat.js';
import { initPush, enablePushNotifications } from './push-native.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { renderPremiumSection, initSponsorAdEntry, loadAdBanner } from './monetization.js';