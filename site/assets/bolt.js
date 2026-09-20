/* ==========================================================================
   Bolt Group - behaviour that is ours, not Elementor's.
   ========================================================================== */
(function () {
    'use strict';

    /* ----------------------------------------------------------------------
       "Marcas que integran el grupo" - mobile sheet

       Desktop keeps the original behaviour: the logo grid swaps the panel
       shown in .main-stage above it. On a phone that stage is off-screen by
       the time you reach the grid, so the tap appeared to do nothing. Here a
       tap opens the panel as a sheet over the page instead.

       The panel element is MOVED into the sheet and moved back on close, not
       cloned, so there is only ever one copy of each brand's text in the
       document.
       ---------------------------------------------------------------------- */
    function initEcosistemaSheet() {
        var root = document.querySelector('.ecosistema-global');
        if (!root) return;

        var stage = root.querySelector('.main-stage');
        var mobile = window.matchMedia('(max-width: 767px)');
        var home = {};          // panel id -> where it came from
        var openPanel = null;

        var sheet = document.createElement('div');
        sheet.className = 'bolt-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.hidden = false;
        sheet.innerHTML =
            '<div class="bolt-sheet__backdrop" data-bolt-close></div>' +
            '<div class="bolt-sheet__panel">' +
              '<div class="bolt-sheet__handle"></div>' +
              '<button type="button" class="bolt-sheet__close" data-bolt-close aria-label="Cerrar">&#10005;</button>' +
              '<div class="bolt-sheet__body"></div>' +
            '</div>';
        document.body.appendChild(sheet);
        var body = sheet.querySelector('.bolt-sheet__body');

        function remember(panel) {
            if (!home[panel.id]) {
                home[panel.id] = { parent: panel.parentNode, next: panel.nextSibling };
            }
        }

        function restore(panel) {
            var h = home[panel.id];
            if (!h) return;
            h.parent.insertBefore(panel, h.next);
        }

        function open(id) {
            var panel = document.getElementById(id);
            if (!panel) return;
            close(true);
            remember(panel);
            body.appendChild(panel);
            panel.classList.add('active');
            openPanel = panel;
            sheet.classList.add('is-open');
            document.body.classList.add('bolt-sheet-open');
            body.scrollTop = 0;
            var v = panel.querySelector('video');
            if (v) { try { v.currentTime = 0; v.play(); } catch (e) {} }
            var btn = sheet.querySelector('.bolt-sheet__close');
            if (btn) btn.focus({ preventScroll: true });
        }

        function close(silent) {
            if (!openPanel) return;
            var v = openPanel.querySelector('video');
            if (v) { try { v.pause(); } catch (e) {} }
            openPanel.classList.remove('active');
            restore(openPanel);
            openPanel = null;
            sheet.classList.remove('is-open');
            document.body.classList.remove('bolt-sheet-open');
            if (!silent) {
                root.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
                var start = document.getElementById('inicio-ecosistema');
                if (start) start.classList.add('active');
            }
        }

        // capture phase: stops the inline onclick="openTab(...)" from running
        document.addEventListener('click', function (e) {
            if (!mobile.matches) return;
            var item = e.target.closest && e.target.closest('.ecosistema-global .nav-item');
            if (!item) return;
            var call = item.getAttribute('onclick') || '';
            var m = call.match(/openTab\(\s*event\s*,\s*['"]([^'"]+)['"]/);
            if (!m) return;
            e.preventDefault();
            e.stopPropagation();
            root.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
            item.classList.add('active');
            open(m[1]);
        }, true);

        sheet.addEventListener('click', function (e) {
            if (e.target.closest('[data-bolt-close]')) close();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });

        // swipe the sheet down to dismiss
        var startY = null;
        sheet.addEventListener('touchstart', function (e) {
            startY = body.scrollTop <= 0 ? e.touches[0].clientY : null;
        }, { passive: true });
        sheet.addEventListener('touchend', function (e) {
            if (startY !== null && e.changedTouches[0].clientY - startY > 70) close();
            startY = null;
        }, { passive: true });

        // if the window grows past the breakpoint, hand control back to desktop
        var onChange = function () { if (!mobile.matches) close(); };
        mobile.addEventListener ? mobile.addEventListener('change', onChange)
                                : mobile.addListener(onChange);
    }


    /* ----------------------------------------------------------------------
       Language switching, in place

       The old site served Spanish and English as separate WordPress pages
       (/ and /en/inicio/). This is one page: assets/i18n.<page>.js carries the
       English for every Spanish string on it, in document order, and the
       switch swaps the text nodes without a reload.

       Nodes are bound ONCE at load and held by reference, so anything that
       later moves an element (the mobile sheet does) cannot desynchronise it.
       Binding is by string rather than by position, so editing one piece of
       copy only ever costs that one translation.
       ---------------------------------------------------------------------- */
    function initLanguage() {
        var data = window.BOLT_I18N;
        if (!data || !data.strings) return;

        var STORAGE = 'bolt-lang';
        var bound = [];

        // queue the english per distinct spanish string, in document order
        var queues = {}, cursor = {};
        data.strings.forEach(function (pair) {
            (queues[pair[0]] = queues[pair[0]] || []).push(pair[1]);
        });

        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode;
                if (!p) return NodeFilter.FILTER_REJECT;
                var tag = p.nodeName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') {
                    return NodeFilter.FILTER_REJECT;
                }
                return n.nodeValue.trim().length > 1
                    ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });

        var node;
        while ((node = walker.nextNode())) {
            var text = node.nodeValue.trim();
            var q = queues[text];
            if (!q) continue;
            var k = cursor[text] || 0;
            if (k >= q.length) continue;
            cursor[text] = k + 1;

            var ws = node.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/);
            bound.push({
                node: node,
                es: text,
                en: q[k],
                lead: ws ? ws[1] : '',
                trail: ws ? ws[2] : ''
            });
        }

        function apply(lang) {
            bound.forEach(function (b) {
                var text = lang === 'en' ? b.en : b.es;
                b.node.nodeValue = text ? (b.lead + text + b.trail) : '';

                // english sometimes says in two lines what spanish says in
                // three; blank the line AND its <br> so no gap is left behind
                var prev = b.node.previousSibling;
                if (prev && prev.nodeName === 'BR') {
                    prev.style.display = text ? '' : 'none';
                }
                // and if that empties the whole element, take the element out
                var parent = b.node.parentNode;
                if (parent && parent.nodeType === 1) {
                    if (!text && !parent.textContent.trim()) {
                        parent.setAttribute('data-bolt-emptied', '1');
                        parent.style.display = 'none';
                    } else if (parent.getAttribute('data-bolt-emptied')) {
                        parent.removeAttribute('data-bolt-emptied');
                        parent.style.display = '';
                    }
                }
            });

            var m = (data.meta && data.meta[lang]) || null;
            if (m) {
                document.documentElement.lang = m.lang || lang;
                if (m.title) document.title = m.title;
                var d = document.querySelector('meta[name="description"]');
                if (d && m.description) d.setAttribute('content', m.description);
            }

            document.documentElement.setAttribute('data-bolt-lang', lang);
            document.querySelectorAll('[data-bolt-lang-link]').forEach(function (a) {
                var on = a.getAttribute('data-bolt-lang-link') === lang;
                a.closest('li') && a.closest('li').classList.toggle('cpel-switcher__lang--active', on);
                a.setAttribute('aria-current', on ? 'true' : 'false');
            });

            try { localStorage.setItem(STORAGE, lang); } catch (e) {}

            var url = new URL(window.location.href);
            if (lang === 'en') url.searchParams.set('lang', 'en');
            else url.searchParams.delete('lang');
            history.replaceState(null, '', url);
        }

        document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('[data-bolt-lang-link]');
            if (!a) return;
            e.preventDefault();
            apply(a.getAttribute('data-bolt-lang-link'));
        });

        // ?lang= wins, then whatever the visitor last chose, then Spanish.
        // Spanish is the default because that is what the old site served at
        // this URL. To follow the browser's language instead, replace the
        // final fallback with:
        //   (navigator.language || '').toLowerCase().indexOf('es') === 0 ? 'es' : 'en'
        var initial = new URL(window.location.href).searchParams.get('lang');
        if (initial !== 'en' && initial !== 'es') {
            try { initial = localStorage.getItem(STORAGE); } catch (e) { initial = null; }
        }
        if (initial !== 'en' && initial !== 'es') initial = 'es';
        apply(initial);

        window.boltSetLanguage = apply;   // handy from the console
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initEcosistemaSheet(); initLanguage(); });
    } else {
        initEcosistemaSheet();
        initLanguage();
    }
})();
