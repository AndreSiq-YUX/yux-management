import { expect, it } from 'vitest'
import { extractRadarContacts, normalizeRadarPhone } from '../src/modules/radar/contact-evidence.js'
it('lists social profiles, not individual posts, videos or private administration URLs',()=>{
 const urls=['https://instagram.com/alfa/','https://instagram.com/p/ABC123/','https://www.youtube.com/watch?v=123','https://www.youtube.com/@Alfa','https://www.linkedin.com/company/98046245/admin/feed/posts/','https://www.linkedin.com/company/alfa/'];
 const contacts=extractRadarContacts({url:'https://alfa.example/',observedAt:'2026-10-22',text:'Empresa Alfa',html:urls.map(url=>`<a href="${url}">Rede</a>`).join('')});
 expect(contacts.filter(contact=>contact.kind==='social').map(contact=>contact.value)).toEqual(['https://instagram.com/alfa/','https://www.youtube.com/@Alfa','https://www.linkedin.com/company/alfa/']);
});
it('recognizes Compras in a multipurpose contact form without turning it into a finance-only channel',()=>{
 const contacts=extractRadarContacts({url:'https://alfa.example/contato/',observedAt:'2026-10-22',text:'Fale conosco. Comercial Compras Marketing RH Financeiro Outros',html:'<form><select name="assunto"><option>Comercial</option><option>Compras</option><option>Marketing</option><option>RH</option><option>Financeiro</option><option>Outros</option></select><textarea name="mensagem"></textarea></form>'});
 expect(contacts).toContainEqual(expect.objectContaining({kind:'contact_form',purpose:'suppliers'}));
});
it('recognizes a supplier form whose purpose is published in select options rather than a footer',()=>{
  // Reduced public Contact Form 7 structure: option text is visible, scripts are not evidence.
  const contacts=extractRadarContacts({url:'https://alfa.example/fornecedor/',observedAt:'2026-10-14',
    text:'Seja nosso fornecedor. Preencha o formulário abaixo. AssuntoQuero ser fornecedor Produto OferecidoInsumosAlimentos. Nossa política de privacidade.',
    html:'<form><input type="hidden" name="_wpcf7" value="238"/><select name="assunto"><option>Quero ser fornecedor</option></select><select name="produtoOferecido"><option>Alimentos</option></select><textarea name="mensagem"></textarea><script>document.getElementById("ak_js_1").setAttribute("value",Date.now())</script></form>'})
  expect(contacts).toContainEqual(expect.objectContaining({kind:'contact_form',purpose:'suppliers',value:'https://alfa.example/fornecedor/'}))
  expect(contacts.find(contact=>contact.kind==='contact_form')?.purposeEvidence).not.toContain('document.getElementById')
})
it('records a supplier contact form as a channel, not its submission endpoint',()=>{
  const contacts=extractRadarContacts({url:'https://alfa.example/fornecedor/',observedAt:'2026-10-14',text:'Seja fornecedor. Ofereça produtos para nossa empresa.',html:'<form action="https://external.example/submit"><label>E-mail<input type="email"/></label><textarea name="mensagem"></textarea><button>Enviar</button></form>'},'review')
  expect(contacts).toContainEqual(expect.objectContaining({kind:'contact_form',value:'https://alfa.example/fornecedor/',purpose:'suppliers',association:'review'}))
})
it.each(['<form role="search"><input type="search"/></form>','<form><input type="email"/><button>Assinar newsletter</button></form>','<form><input type="password"/><button>Entrar</button></form>'])('does not promote search, newsletter or login forms to business channels',html=>{
  expect(extractRadarContacts({url:'https://alfa.example/',observedAt:'2026-10-14',text:'Seja nosso fornecedor. Fale conosco.',html}).filter(contact=>contact.kind==='contact_form')).toEqual([])
})
it('extracts_href_only_contacts_with_sources_and_no_whatsapp_guess', () => {
  const page = { url: 'https://alfa.example/contato', observedAt: '2026-10-08', text: '', html: '<a href="mailto:comercial@alfa.example">Escreva</a><a href="tel:+554133334444">Ligue</a><a href="https://wa.me/5541999998888">WhatsApp</a><a href="https://instagram.com/alfa">Instagram</a>' }
  const contacts = extractRadarContacts(page)
  expect(contacts.map(item => item.kind)).toEqual(expect.arrayContaining(['phone','email','whatsapp','social']))
  expect(contacts.every(item => item.sourceUrl === page.url && item.observedAt === page.observedAt)).toBe(true)
  expect(contacts.filter(item => item.kind === 'whatsapp')).toHaveLength(1)
})
it('normalizes_brazilian_phones_without_inventing_digits', () => {
  expect(normalizeRadarPhone('(41) 3333-4444')).toBe('+554133334444')
  expect(normalizeRadarPhone('99999-8888')).toBeUndefined()
  expect(normalizeRadarPhone('+55 41 99999-8888')).toBe('+5541999998888')
})
it('distinguishes supplier, sales and recruitment contexts rather than email names',()=>{
  const contacts=extractRadarContacts({url:'https://alfa.example',observedAt:'2026-10-12',text:
    'FORNECEDORES Quero oferecer meus produtos e serviços. Fale por aqui: compras@alfa.example. COMERCIAL Solicite uma proposta: vendas@alfa.example. VAGAS Envie seu currículo: rh@alfa.example.'})
  expect(contacts.find(item=>item.value==='compras@alfa.example')?.purpose).toBe('suppliers')
  expect(contacts.find(item=>item.value==='vendas@alfa.example')?.purpose).toBe('sales')
  expect(contacts.find(item=>item.value==='rh@alfa.example')?.purpose).toBe('recruitment')
})
it('uses preceding mailto section, not the next department or a nearby recruitment heading',()=>{
  const contacts=extractRadarContacts({url:'https://alfa.example/',observedAt:'2026-10-12',text:'',html:
    '<h2>PROPOSTA</h2><p>Quero uma proposta.</p><a href="mailto:vendas@alfa.example">Fale por aqui</a><h2>FORNECEDORES</h2><a href="mailto:compras@alfa.example">Ofereça produtos</a><h2>VAGAS</h2><a href="https://wa.me/5541999990000">Vagas</a><p>CEP 80000-000</p><a href="tel:4133334444">Telefone geral</a><p>Canal de ética: etica@alfa.example</p>'})
  expect(contacts.find(item=>item.value==='vendas@alfa.example')?.purpose).toBe('sales')
  expect(contacts.find(item=>item.value==='+5541999990000')?.purpose).toBe('recruitment')
  expect(contacts.find(item=>item.value==='+554133334444')?.purpose).not.toBe('recruitment')
})
