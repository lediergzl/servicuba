const STYLE_ID = 'servicuba-landing-experience';
const ROOT_ID = 'servicuba-landing-experience';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .sc-landing { margin: 28px auto 0; max-width: 430px; text-align:left; }
        .sc-landing__promise { padding:18px; border-radius:18px; background:linear-gradient(145deg,var(--ink),var(--ink-soft)); color:#fff; box-shadow:var(--shadow-raised); position:relative; overflow:hidden; }
        .sc-landing__promise::after { content:''; position:absolute; width:120px; height:120px; right:-45px; top:-55px; border:18px solid rgba(242,183,5,.14); border-radius:50%; }
        .sc-landing__eyebrow { display:inline-flex; align-items:center; gap:7px; font-family:var(--font-mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
        .sc-landing__dot { width:7px; height:7px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 4px rgba(242,183,5,.13); }
        .sc-landing__headline { margin:8px 0 7px; font-family:var(--font-display); font-size:27px; line-height:1; font-weight:800; color:#fff; }
        .sc-landing__copy { margin:0; color:rgba(255,255,255,.78); font-size:13px; }
        .sc-landing__slogan { margin:14px 0 0; font-size:14px; font-weight:800; color:var(--accent); }
        .sc-landing__section-title { margin:24px 2px 10px; font-family:var(--font-display); font-size:22px; font-weight:800; }
        .sc-landing__steps { display:grid; gap:10px; }
        .sc-step { display:grid; grid-template-columns:64px 1fr; gap:12px; align-items:center; padding:11px; border:1px solid var(--line); border-radius:16px; background:var(--paper-raised); box-shadow:var(--shadow-card); }
        .sc-step__visual { height:64px; border-radius:13px; display:grid; place-items:center; background:var(--paper); overflow:hidden; position:relative; color:var(--ink); }
        .sc-step__visual::before { content:''; position:absolute; inset:10px; border:1px solid var(--line); border-radius:10px; }
        .sc-step__house { width:25px; height:20px; border:2px solid currentColor; border-top:0; position:relative; margin-top:8px; }
        .sc-step__house::before { content:''; position:absolute; width:19px; height:19px; border-left:2px solid currentColor; border-top:2px solid currentColor; transform:rotate(45deg); left:1px; top:-10px; }
        .sc-step__pin { width:22px; height:22px; border:3px solid var(--copper); border-radius:50% 50% 50% 0; transform:rotate(-45deg); position:relative; }
        .sc-step__pin::after { content:''; width:6px; height:6px; border-radius:50%; background:var(--copper); position:absolute; left:5px; top:5px; }
        .sc-step__chat { width:34px; height:24px; border:2px solid var(--success); border-radius:8px; position:relative; }
        .sc-step__chat::after { content:''; position:absolute; bottom:-7px; left:8px; width:9px; height:9px; border-left:2px solid var(--success); transform:skewY(-35deg); background:var(--paper); }
        .sc-step__title { font-size:14px; font-weight:800; margin-bottom:3px; }
        .sc-step__text { font-size:12px; line-height:1.45; color:var(--muted); }
        .sc-landing__roles { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .sc-role { padding:14px; border:1px solid var(--line); border-radius:15px; background:var(--paper-raised); box-shadow:var(--shadow-xs); }
        .sc-role strong { display:block; font-size:14px; margin-bottom:4px; }
        .sc-role span { display:block; color:var(--muted); font-size:11.5px; line-height:1.45; }
        .sc-landing__guest { margin-top:12px; padding:12px 14px; border-radius:13px; background:#E7F3EE; color:var(--success); font-size:12px; font-weight:700; }
        .sc-landing__guest::before { content:'✓'; display:inline-grid; place-items:center; width:19px; height:19px; margin-right:7px; border-radius:50%; background:var(--success); color:#fff; }
        .sc-landing__cta { display:grid; gap:8px; margin-top:14px; }
        @media (max-width:360px) { .sc-landing__roles { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}

function createLandingExperience() {
    const landing = document.getElementById('landing');
    if (!landing || document.getElementById(ROOT_ID)) return;

    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.className = 'sc-landing';
    root.innerHTML = `
        <div class="sc-landing__promise">
            <div class="sc-landing__eyebrow"><span class="sc-landing__dot"></span> Servicios locales en Cuba</div>
            <div class="sc-landing__headline">Tus problemas, nuestras soluciones.</div>
            <p class="sc-landing__copy">Encuentra a la persona adecuada cerca de ti, o consigue trabajo con tareas que realmente están pasando a tu alrededor.</p>
            <div class="sc-landing__slogan">Lo necesitas. Lo encuentras. Lo resuelves.</div>
        </div>

        <h3 class="sc-landing__section-title">Así funciona</h3>
        <div class="sc-landing__steps">
            <article class="sc-step">
                <div class="sc-step__visual"><div class="sc-step__house"></div></div>
                <div><div class="sc-step__title">1. Publica lo que necesitas</div><div class="sc-step__text">¿Plomero, electricista, repartidor? Describe la tarea, indica la zona y publica el aviso.</div></div>
            </article>
            <article class="sc-step">
                <div class="sc-step__visual"><div class="sc-step__pin"></div></div>
                <div><div class="sc-step__title">2. Busca cerca de ti</div><div class="sc-step__text">Explora tareas y servicios en mapa o lista. Filtra por distancia y categoría.</div></div>
            </article>
            <article class="sc-step">
                <div class="sc-step__visual"><div class="sc-step__chat"></div></div>
                <div><div class="sc-step__title">3. Conecten y acuerden</div><div class="sc-step__text">Hablen por el chat interno para acordar precio, horario y cómo realizar el trabajo.</div></div>
            </article>
        </div>

        <h3 class="sc-landing__section-title">¿Qué quieres hacer?</h3>
        <div class="sc-landing__roles">
            <div class="sc-role"><strong>🏠 Necesito un servicio</strong><span>Publica una tarea y encuentra trabajadores cerca de tu zona.</span></div>
            <div class="sc-role"><strong>🧰 Quiero trabajar</strong><span>Encuentra tareas cercanas que encajen con tu oficio.</span></div>
        </div>
        <div class="sc-landing__guest">Puedes explorar ServiCuba antes de registrarte. Tus datos solo son necesarios cuando quieras realizar una acción.</div>
        <div class="sc-landing__cta">
            <button type="button" class="btn btn-accent btn-block" data-sc-discover>Explorar servicios</button>
        </div>
    `;

    landing.appendChild(root);
    root.querySelector('[data-sc-discover]')?.addEventListener('click', () => {
        document.getElementById('heroSearchInput')?.focus();
        root.scrollIntoView({ behavior:'smooth', block:'start' });
    });
}

export function initLandingExperience() {
    injectStyles();
    createLandingExperience();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLandingExperience, { once:true });
else initLandingExperience();