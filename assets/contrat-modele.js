/* Contrat de travail à durée indéterminée — modèle Wellington & Marley.
   Source UNIQUE du contrat : contrat.html (le bot le capture en image pour le ticket) et le bouton 📄 de la fiche RH
   (admin.html) appellent la même fonction, donc les deux produisent exactement le même document.

   Remplissage automatique à partir de la fiche RH : nom, prénom, ID (n° de sécurité sociale), téléphone, poste,
   date d'arrivée (« à compter du »), date du jour (« Fait le »), signature de l'employé en écriture manuscrite.
   La date de naissance n'est pas dans la fiche RH : elle reste à compléter à la main.

   Si le fichier assets/sceau-wellington.png existe, il remplace le sceau dessiné ci-dessous. */
(function(){
  const esc=x=>String(x==null?'':x).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  function champs(r){
    const full=String(r.nom||'').trim();
    const parts=full.split(/\s+/), prenom=parts[0]||'', nomF=parts.slice(1).join(' ')||'';
    const gr=String(r.grade||'').trim();
    const poste=/^(stagiaire|int[ée]rimaire|raffineur)/i.test(gr)?'Runner':(gr||'Runner');
    const d=String(r.arrivee||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const aujourdhui=(function(){ const n=new Date(); try{ const p=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric'}).format(n); return p; }catch(e){ return n.toLocaleDateString('fr-FR'); } })();
    return {full,prenom,nomF,poste,jo:d?d[3]:'',mo:d?d[2]:'',an:d?d[1]:'',tel:String(r.tel||'').trim(),idU:String(r.idU||'').trim(),aujourdhui};
  }

  function sceauSVG(sz,k){
    return `<svg viewBox="0 0 200 200" width="${sz}" height="${sz}" xmlns="http://www.w3.org/2000/svg"><defs>
      <path id="arc${k}" d="M100,100 m-73,0 a73,73 0 1,1 146,0 a73,73 0 1,1 -146,0"/>
      <linearGradient id="or${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4dc92"/><stop offset=".5" stop-color="#b58a2c"/><stop offset="1" stop-color="#f1d37c"/></linearGradient></defs>
      <circle cx="100" cy="100" r="96" fill="none" stroke="url(#or${k})" stroke-width="5"/>
      <circle cx="100" cy="100" r="88" fill="none" stroke="url(#or${k})" stroke-width="1.5"/>
      <circle cx="100" cy="100" r="58" fill="none" stroke="url(#or${k})" stroke-width="2.5"/>
      <text font-family="EB Garamond,Georgia,serif" font-size="13.5" font-weight="700" fill="#9a7420"><textPath href="#arc${k}" startOffset="0" textLength="446" lengthAdjust="spacing">· LA AVOCAT · WELLINGTON &amp; MARLEY ·</textPath></text>
      <text x="100" y="118" text-anchor="middle" font-family="EB Garamond,Georgia,serif" font-size="58" font-weight="700" fill="url(#or${k})">WM</text></svg>`;
  }

  function sceau(sz,k,base){
    const url=new URL('assets/sceau-wellington.png',base||location.href).href;
    const repli=sceauSVG(sz,k).replace(/"/g,'&quot;').replace(/\n\s*/g,'');
    return `<img src="${url}" width="${sz}" height="${sz}" style="display:block;object-fit:contain" alt="" onerror="this.outerHTML=this.dataset.svg" data-svg="${repli}">`;
  }

  const ARTICLES=[
    ['ARTICLE 1','Objet du contrat',a=>`Le salarié est engagé à compter du <b class="v">${a.jo?esc(a.jo):'____'}/${a.mo?esc(a.mo):'____'}/${a.an?esc(a.an):'________'}</b> dans le cadre d’un contrat de travail à durée indéterminée. Le contrat est régi par les dispositions légales et conventionnelles applicables à Oil Roxwood et par les dispositions particulières du présent contrat.`],
    ['ARTICLE 2','Période d’essai et rupture du contrat',()=>`La période d’essai est celle prévue dans la fiche de poste et le règlement intérieur. Pendant cette période, chaque partie peut rompre le contrat sans indemnité particulière, sous réserve d’en informer l’autre dans un délai raisonnable. Après validation, le contrat peut prendre fin par démission, licenciement ou révocation pour motif disciplinaire ou professionnel, accord commun, faute grave ou manquement contractuel. Tout comportement portant atteinte à l’image, au fonctionnement ou à la sécurité d’Oil Roxwood peut être sanctionné jusqu’à la rupture du contrat.`],
    ['ARTICLE 3','Changement de poste, d’affectation ou évolution interne',()=>`Tout changement de statut, de poste, d’affectation ou de responsabilités fait l’objet d’un avenant signé par les deux parties. Oil Roxwood peut adapter les fonctions selon les besoins du service en informant l’employé et en respectant les règles internes. Toute modification importante nécessite une validation écrite des deux parties.`],
    ['ARTICLE 4','Confidentialité',()=>`Le salarié s’engage à préserver la confidentialité des informations internes : organisation, fournisseurs, stocks, méthodes de travail, tarifs et autres données non publiques. Il ne peut utiliser le nom ou l’image d’Oil Roxwood à des fins personnelles ou commerciales sans autorisation de la Direction. Cette obligation demeure après la fin du contrat pour les informations confidentielles. Tout manquement peut être sanctionné conformément au règlement intérieur.`],
    ['ARTICLE 5','Obligations professionnelles de l’employé',()=>`L’employé s’engage à respecter le règlement intérieur, la hiérarchie et ses consignes ; à adopter un comportement professionnel, respectueux et impartial envers clients et collègues ; à faire preuve de discrétion, neutralité et réserve ; à préserver l’image d’Oil Roxwood et à exercer ses fonctions avec sérieux, ponctualité et intégrité. Tout manquement peut entraîner des sanctions disciplinaires.`],
    ['ARTICLE 6','Missions et fonctions du poste',()=>`Les missions et responsabilités du salarié sont détaillées dans la fiche de poste remise à l’employé, qui reconnaît en avoir pris connaissance et s’engage à les accomplir dans l’intérêt de l’entreprise.`],
    ['ARTICLE 7','Règlement intérieur',()=>`L’employé reconnaît avoir pris connaissance du règlement intérieur d’Oil Roxwood et s’engage à le respecter dès la signature du présent contrat.`],
    ['ARTICLE 8','Rémunérations',()=>`La rémunération est définie par la fiche de poste et dépend du quota et du travail effectués.`],
  ];

  /* Renvoie le HTML d'une page A4 (793 × 1121 px) — l'élément racine porte l'id « pret » (le bot attend cet id). */
  window.contratModeleHTML=function(r,opt){
    const base=(opt&&opt.base)||location.href, a=champs(r||{});
    const logo=new URL('assets/logo-complet.png',base).href;
    const sigSize=Math.max(20,Math.min(38,Math.floor(210/(Math.max(1,a.full.length)*0.5))));
    const posteSize=Math.max(10,Math.min(13,Math.floor(150/(Math.max(1,a.poste.length)*0.55))));
    const ligne=(lbl,val)=>`<div class="lg"><span class="lb">${lbl}</span> <span class="v">${val?esc(val):''}</span></div>`;
    return `<div id="pret" style="position:relative;width:793px;height:1121px;background:#fff;overflow:hidden;color:#2a4a7a;font-family:'EB Garamond',Georgia,serif">
  <style>
    #pret *{box-sizing:border-box;margin:0;padding:0}
    #pret .cadre{position:absolute;inset:14px;border:3px double #c8a24a;border-radius:3px}
    #pret .cadre::before{content:"";position:absolute;inset:6px;border:1px solid #e0c98a}
    #pret .fond{position:absolute;left:50%;top:560px;transform:translate(-50%,-50%);opacity:.07}
    #pret .tete{position:absolute;left:46px;right:46px;top:38px;height:130px;display:flex;align-items:center;justify-content:space-between}
    #pret h1{font-size:25px;line-height:1.15;text-align:center;font-weight:700;color:#14284a;letter-spacing:.2px}
    #pret .boite{position:absolute;top:196px;width:322px;height:166px;border:1.5px solid #1c1c1c;background:#fff;padding:10px 14px;color:#15233d}
    #pret .boite h3{font-size:14px;font-weight:700;margin-bottom:9px;color:#101a2e}
    #pret .lg{font-size:12.6px;line-height:1.28;margin-bottom:5px;white-space:nowrap}
    #pret .lb{text-decoration:underline;color:#2a4a7a}
    #pret .v{color:#15233d;font-weight:700}
    #pret .petit{font-size:9px;font-style:italic;color:#3d5b88;margin-top:4px}
    #pret .arts{position:absolute;left:52px;right:52px;top:388px}
    #pret .art{margin-bottom:10px}
    #pret .art h4{font-size:12.5px;font-weight:700;color:#14284a;letter-spacing:.2px;margin-bottom:2px}
    #pret .art p{font-size:11.8px;line-height:1.32;text-align:justify;hyphens:auto}
    #pret .sig{position:absolute;top:944px;width:230px;text-align:center}
    #pret .sig small{display:block;font-size:10.5px;color:#14284a}
    #pret .sig .lu{font-family:'Dancing Script',cursive;font-weight:700;font-size:14px;color:#15233d;margin:3px 0 5px}
    #pret .sig .cad{height:66px;display:flex;align-items:center;justify-content:center;font-family:'Dancing Script',cursive;font-weight:700;color:#15233d;white-space:nowrap}
    #pret .fait{position:absolute;right:58px;top:1010px;font-size:14px;line-height:1.35;color:#14284a}
    #pret .fait b{color:#15233d}
  </style>
  <div class="cadre"></div>
  <div class="fond">${sceau(520,'f',base)}</div>
  <div class="tete">
    <div style="width:118px">${sceau(118,'h',base)}</div>
    <h1>Contrat de Travail<br>à durée indéterminée</h1>
    <img src="${logo}" alt="Oil Roxwood" style="width:122px;display:block">
  </div>
  <div class="boite" style="left:50px">
    <h3>Et d’autre part,</h3>
    ${ligne('Prénom et Nom :',a.full)}${ligne('Date de naissance :','')}${ligne('N° de Sécurité Social :',a.idU)}${ligne('N° Téléphone :',a.tel)}
    <div class="lg"><span class="lb">Poste :</span> <span class="v" style="font-size:${posteSize}px">${esc(a.poste)}</span></div>
    <div class="petit">Ci-après dénommé(e) “l’Employé”</div>
  </div>
  <div class="boite" style="right:50px">
    <h3>D’une part,</h3>
    <div class="lg"><span class="lb" style="font-weight:700;color:#15233d">Stella Collins</span></div>
    <div class="lg"><b>Patron</b></div>
    <div class="lg"><b style="font-style:italic">Oil Roxwood</b></div>
    <div class="petit">Ci-après dénommé “l’Employeur”</div>
  </div>
  <div class="arts">${ARTICLES.map(([n,t,f])=>`<div class="art"><h4>${n} – ${t}</h4><p>${f(a)}</p></div>`).join('')}</div>
  <div class="sig" style="left:52px"><small>Signature de l’employé(e) :</small><div class="lu">Lu et certifié conforme</div><div class="cad" style="font-size:${sigSize}px">${esc(a.full)}</div></div>
  <div class="sig" style="left:310px"><small>Signature de l’employeur :</small><div class="lu">Lu et certifié conforme</div><div class="cad" style="font-size:30px">Stella Collins</div></div>
  <div class="fait">Fait le <b>${esc(a.aujourdhui)}</b><br>À <b>Roxwood</b></div>
</div>`;
  };
})();
