/* mobile.js — inyecta botón hamburguesa + drawer en subpáginas
   que usan <header class="site"> con un <nav> interno.
   También activa el botón hamburguesa del homepage cuyo onClick
   depende del runtime DC que no siempre está inicializado. */
(function(){
  function initHomepageHamburger(){
    var btn = document.querySelector('header.site-header .mobile-btn');
    if(!btn) return;
    var nav = document.querySelector('header.site-header .desktop-nav');
    if(!nav) return;
    // Crear drawer si no existe
    var header = btn.closest('header');
    var drawer = header.querySelector('.mobile-drawer-home');
    if(!drawer){
      drawer = document.createElement('div');
      drawer.className = 'mobile-drawer mobile-drawer-home';
      drawer.style.position = 'fixed';
      drawer.style.left = '12px';
      drawer.style.right = '12px';
      // Se posiciona debajo del header: 14px padding + 60px logo + 14px margen
      drawer.style.top = '88px';
      drawer.style.zIndex = '9999';
      Array.prototype.forEach.call(nav.querySelectorAll('a'), function(a){
        var link = document.createElement('a');
        link.href = a.getAttribute('href');
        link.textContent = a.textContent.trim();
        link.addEventListener('click', function(){ drawer.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); });
        drawer.appendChild(link);
      });
      header.appendChild(drawer);
    }
    // Reemplazar el onClick DC roto por un handler funcional
    btn.setAttribute('onclick','');
    btn.onclick = null;
    btn.addEventListener('click', function(e){
      e.preventDefault();e.stopPropagation();
      var open = drawer.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open?'true':'false');
    });
    document.addEventListener('click', function(e){
      if(!drawer.classList.contains('is-open')) return;
      if(header.contains(e.target)) return;
      drawer.classList.remove('is-open');
      btn.setAttribute('aria-expanded','false');
    });
  }

  function init(){
    initHomepageHamburger();
    var header = document.querySelector('header.site');
    if(!header) return;
    var wrap = header.querySelector('.wrap') || header.firstElementChild;
    var nav  = header.querySelector('nav');
    if(!wrap || !nav) return;
    if(header.querySelector('.mobile-menu-btn')) return; // ya inyectado

    // Botón hamburguesa
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-menu-btn';
    btn.setAttribute('aria-label','Abrir menú');
    btn.setAttribute('aria-expanded','false');
    btn.innerHTML = '<span></span><span></span><span></span>';
    wrap.appendChild(btn);

    // Drawer con los mismos links del nav
    var drawer = document.createElement('div');
    drawer.className = 'mobile-drawer';
    Array.prototype.forEach.call(nav.querySelectorAll('a'), function(a){
      var link = document.createElement('a');
      link.href = a.getAttribute('href');
      link.textContent = a.textContent.trim();
      if(a.classList.contains('active')) link.classList.add('active');
      link.addEventListener('click', close);
      drawer.appendChild(link);
    });
    // Añadir enlace CTA al final del drawer
    var cta = header.querySelector('.cta');
    if(cta){
      var ctaLink = document.createElement('a');
      ctaLink.href = cta.getAttribute('href');
      ctaLink.textContent = cta.textContent.trim() || 'Escribinos';
      ctaLink.style.background = 'var(--green)';
      ctaLink.style.color = 'var(--cream)';
      ctaLink.style.textAlign = 'center';
      ctaLink.style.marginTop = '4px';
      ctaLink.addEventListener('click', close);
      drawer.appendChild(ctaLink);
    }
    header.appendChild(drawer);

    function open(){ drawer.classList.add('is-open'); btn.setAttribute('aria-expanded','true'); }
    function close(){ drawer.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); }
    btn.addEventListener('click', function(){
      if(drawer.classList.contains('is-open')) close(); else open();
    });
    document.addEventListener('click', function(e){
      if(!drawer.classList.contains('is-open')) return;
      if(header.contains(e.target)) return;
      close();
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // El runtime DC re-renderiza el header más tarde: reintentamos
  setTimeout(init, 400);
  setTimeout(init, 1200);
  setTimeout(init, 2500);
})();
