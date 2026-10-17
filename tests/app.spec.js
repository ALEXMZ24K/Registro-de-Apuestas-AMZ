// Pruebas automáticas de AlexPicks. Corren con la base de datos FALSA (modo prueba), nunca con la real.
const { test, expect } = require('@playwright/test');

// Abre la app limpia (datos de ejemplo recién creados) y junta cualquier error de JavaScript
async function abrir(page, rol = 'admin') {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(`/?prueba=1&reiniciar=1&rol=${rol}`);
  await expect(page.getByText(/GANANCIA DE|RESULTADO DE/).first()).toBeVisible({ timeout: 20000 });
  return errores;
}
const tab = (page, nombre) => page.locator('.tabbar button', { hasText: nombre }).first();

test.describe('Cuentas', () => {
  test('momios, ganancias y pistas en vivo', async ({ page }) => {
    await abrir(page);
    const r = await page.evaluate(() => {
      const ev = { k: 'soccer/mex.1', h: { n: 'Tigres', full: 'Tigres UANL', a: 'TIG' }, a: { n: 'Toluca', full: 'Toluca', a: 'TOL' } };
      const nfl = { k: 'football/nfl', h: { n: 'Bills', full: 'Buffalo Bills', a: 'BUF' }, a: { n: 'Chiefs', full: 'Kansas City Chiefs', a: 'KC' } };
      const nba = { k: 'basketball/nba', h: { n: 'Raptors', full: 'Toronto Raptors', a: 'TOR' }, a: { n: 'Knicks', full: 'New York Knicks', a: 'NY' } };
      const v = (hs, as, st = 'in', extra = {}) => ({ hs: String(hs), as: String(as), st, ...extra });
      const p = (d, e, vv) => { const x = pistaPick({ descripcion: d }, e, vv); return x ? x.txt : null; };
      return {
        dec140: momioToDec(-140).toFixed(3),
        dec150: momioToDec(150).toFixed(2),
        gan: gPct({ resultado: 'Ganada', monto: 2, cuota: -140 }).toFixed(3),
        per: gPct({ resultado: 'Perdida', monto: 2, cuota: -140 }),
        nula: gPct({ resultado: 'Nula', monto: 2, cuota: -140 }),
        ml: p('Tigres ML', ev, v(1, 0)),
        over: p('Over 2.5 goles', ev, v(1, 1)),
        overGanado: p('Over 2.5 goles', ev, v(2, 1)),
        spread: p('Chiefs -3.5', nfl, v(14, 17)),
        btts: p('Ambos equipos marcan: Sí', ev, v(0, 1)),
        remates: p('Tigres Más de 3.5 remates a puerta', ev, v(0, 0, 'in', { eh: { shotsOnTarget: '4' }, ea: {} })),
        jugador: p('Messi Over 0.5 goles', ev, v(1, 0)),
        mlFin: p('Tigres ML', ev, v(1, 2, 'post')),
        equipoOver: p('Tigres over 1.5 goles', ev, v(1, 3)),
        equipoGana: p('Tigres anotan más de 1.5 goles', ev, v(2, 0)),
        equipoUnder: p('Toluca under 1.5 goles', ev, v(0, 2)),
        equipoNba: p('Lakers over 110.5 puntos', { k: 'basketball/nba', h: { n: 'Raptors', full: 'Toronto Raptors', a: 'TOR' }, a: { n: 'Lakers', full: 'Los Angeles Lakers', a: 'LAL' } }, v(100, 95)),
        jugador2: p('Gignac más de 0.5 goles', ev, v(1, 0)),
        overFin: p('Over 2.5 goles', ev, v(1, 0, 'post')),
        underPasa: p('Under 2.5 goles', ev, v(2, 1)),
        spreadFin: p('Chiefs -3.5', nfl, v(17, 24, 'post')),
        cuartoVa: p('Knicks ganan 1 cuarto', nba, v(9, 12, 'in', { per: 1, det: '8:45 - 1st', hl: [9], al: [12] })),
        cuartoGana: p('Knicks 1er cuarto', nba, v(40, 50, 'in', { per: 2, det: '5:00 - 2nd', hl: [20, 20], al: [28, 22] })),
        cuartoNoEmpieza: p('Knicks 2do cuarto', nba, v(9, 12, 'in', { per: 1, det: '8:45 - 1st', hl: [9], al: [12] })),
        cuartoSinDatos: p('Knicks ganan 1 cuarto', nba, v(9, 12)),
        mitadOver: p('1ra mitad over 100.5 puntos', nba, v(60, 45, 'in', { per: 2, det: 'Halftime', hl: [30, 30], al: [20, 25] })),
        primerTiempo: p('Tigres ML primer tiempo', ev, v(1, 1, 'in', { per: 2, det: "60'", hl: [1, 0], al: [0, 1] })),
      };
    });
    expect(r.dec140).toBe('1.714');
    expect(r.dec150).toBe('2.50');
    expect(r.gan).toBe('1.429');
    expect(r.per).toBe(-2);
    expect(r.nula).toBe(0);
    expect(r.ml).toBe('Va ganando');
    expect(r.over).toBe('2 de 3 goles');
    expect(r.overGanado).toContain('¡Ganaste!');
    expect(r.spread).toBe('No está cubriendo');
    expect(r.btts).toBe('Falta que anote Tigres');
    expect(r.remates).toContain('¡Ganaste!');
    expect(r.jugador).toBeNull();
    expect(r.mlFin).toBe('Perdiste · 1-2');
    expect(r.equipoOver).toBe('1 de 2 goles');
    expect(r.equipoGana).toBe('¡Ganaste! · 2 goles');
    expect(r.equipoUnder).toBe('Perdiste · van 2 goles');
    expect(r.equipoNba).toBe('95 de 111 puntos');
    expect(r.jugador2).toBeNull();
    expect(r.overFin).toBe('Perdiste · quedó en 1 gol');
    expect(r.underPasa).toBe('Perdiste · van 3 goles');
    expect(r.spreadFin).toBe('¡Ganaste! · cubrió (24-17)');
    expect(r.cuartoVa).toBe('1er cuarto 12-9 · Va ganando');
    expect(r.cuartoGana).toBe('¡Ganaste! · 1er cuarto 28-20');
    expect(r.cuartoNoEmpieza).toBe('2º cuarto · aún no empieza');
    expect(r.cuartoSinDatos).toBeNull();
    expect(r.mitadOver).toBe('¡Ganaste! · 1ª mitad 45-60');
    expect(r.primerTiempo).toBe('¡Ganaste! · 1er tiempo 1-0');
  });
});

test.describe('Calificar solo', () => {
  test('decide solo cuando está seguro', async ({ page }) => {
    await abrir(page);
    const r = await page.evaluate(() => {
      const ev = id => ({ id, k: 'soccer/mex.1', h: { n: 'Tigres', full: 'Tigres UANL', a: 'TIG' }, a: { n: 'Toluca', full: 'Toluca', a: 'TOL' } });
      const fin = (hs, as, extra = {}) => ({ st: 'post', hs: String(hs), as: String(as), det: 'FT', ...extra });
      const vivo = { e1: fin(2, 0), e2: fin(1, 1), e3: { st: 'in', hs: '1', as: '0', det: "67'" }, e4: fin(0, 0, { det: 'Postponed' }),
        e5: fin(0, 0, { eh: { shotsOnTarget: '6' }, ea: {} }), e6: fin(0, 2), e7: fin(1, 2, { per: 2, hl: [1, 0], al: [0, 2] }) };
      const pick = (descripcion, id) => ({ resultado: 'Pendiente', tipo: 'Moneyline', descripcion, evento: ev(id) });
      const res = x => { const o = resultadoAuto(x, vivo); return o ? (o.res || 'patas') : null; };
      const parlay = (legs) => ({ resultado: 'Pendiente', tipo: 'Parlay/Combinada', patas: legs.map(([desc, id]) => ({ desc, deporte: 'Fútbol', evento: id ? ev(id) : null })) });
      return {
        mlGana: res(pick('Tigres ML', 'e1')),
        mlEmpate: res(pick('Tigres ML', 'e2')),
        enJuego: res(pick('Tigres ML', 'e3')),
        pospuesto: res(pick('Tigres ML', 'e4')),
        remates: res(pick('Tigres Más de 3.5 remates a puerta', 'e5')),
        over: res(pick('Over 1.5 goles', 'e1')),
        jugador: res(pick('Gignac anota', 'e1')),
        yaCalificado: resultadoAuto({ ...pick('Tigres ML', 'e1'), resultado: 'Ganada' }, vivo),
        parlayPierde: res(parlay([['Tigres ML', 'e6'], ['Over 2.5 goles', 'e3']])),
        parlayGana: res(parlay([['Tigres ML', 'e1'], ['Ambos equipos marcan: No', 'e1']])),
        parlayFalta: res(parlay([['Tigres ML', 'e1'], ['Pumas ML', null]])),
        tiempoAuto: res(pick('Toluca gana 2do tiempo', 'e7')),
        equipoAuto: res(pick('Toluca más de 1.5 goles', 'e6')),
      };
    });
    expect(r.mlGana).toBe('Ganada');
    expect(r.mlEmpate).toBe('Perdida');
    expect(r.enJuego).toBeNull();
    expect(r.pospuesto).toBeNull();
    expect(r.remates).toBeNull();
    expect(r.over).toBe('Ganada');
    expect(r.jugador).toBeNull();
    expect(r.yaCalificado).toBeNull();
    expect(r.parlayPierde).toBe('Perdida');
    expect(r.parlayGana).toBe('Ganada');
    expect(r.parlayFalta).toBe('patas');
    expect(r.tiempoAuto).toBe('Ganada');
    expect(r.equipoAuto).toBe('Ganada');
  });
});

test.describe('Pantallas (admin)', () => {
  test('Inicio carga con picks y sin errores', async ({ page }) => {
    const errores = await abrir(page);
    await expect(page.getByText(/Picks de /).first()).toBeVisible();
    await expect(page.getByText('Tigres ML').first()).toBeVisible();
    await expect(page.getByText('Últimos').first()).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('abrir y cerrar un pick', async ({ page }) => {
    await abrir(page);
    await page.getByText('Rays ML').first().click();
    await expect(page.getByText(/Apostado/i).first()).toBeVisible();
    await page.getByText('Rays ML').first().click();
    await expect(page.getByText(/Apostado/i)).toHaveCount(0, { timeout: 3000 });
  });

  test('calificar un pick pendiente', async ({ page }) => {
    const errores = await abrir(page);
    await page.getByText('Pumas ML').first().click();
    await page.getByRole('button', { name: 'Ganada', exact: true }).first().click();
    // 2% de 50,000 a +105 = +$1,050
    await expect(page.getByText('+$1,050').first()).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('deshacer al calificar y al borrar', async ({ page }) => {
    const errores = await abrir(page);
    await page.getByText('Pumas ML').first().click();
    await page.getByRole('button', { name: 'Ganada', exact: true }).first().click();
    await expect(page.getByText('+$1,050').first()).toBeVisible();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
    await expect(page.getByText('GANA').first()).toBeVisible(); // volvió a pendiente
    await page.getByRole('button', { name: 'Borrar' }).first().click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page.getByText('Pick borrado')).toBeVisible();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByText('Pumas ML').first()).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('ocultar y mostrar los picks del mes', async ({ page }) => {
    const errores = await abrir(page);
    await page.getByRole('button', { name: 'Ocultar', exact: true }).click();
    await expect(page.getByText('Pumas ML')).toHaveCount(0);
    await expect(page.getByText(/picks ocultos/)).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await expect(page.getByText('Pumas ML').first()).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('pestañas: Calendario, Anual y Más', async ({ page }) => {
    const errores = await abrir(page);
    await tab(page, 'Calendario').click();
    await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible();
    await page.getByRole('button', { name: /\d{4} ▾/ }).first().click();
    await expect(page.getByText('Ir a hoy')).toBeVisible();
    await page.getByText('Ir a hoy').click();
    await tab(page, 'Anual').click();
    await expect(page.getByText(/BALANCE \d{4}/)).toBeVisible();
    await tab(page, 'Más').click();
    await expect(page.getByText('Tema').first()).toBeVisible();
    await expect(page.getByText('Respaldo para Excel')).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('Calificar solo: modo prueba y activarlo', async ({ page }) => {
    const errores = await abrir(page);
    await tab(page, 'Más').click();
    await page.getByText('Calificar solo').click();
    await expect(page.getByText('Activarlo de verdad')).toBeVisible();
    await page.getByText('Activarlo de verdad').click();
    await expect(page.getByText('ÚLTIMOS CALIFICADOS')).toBeVisible();
    await page.getByText('Apagado', { exact: true }).click();
    await expect(page.getByText('ÚLTIMOS CALIFICADOS')).toHaveCount(0);
    expect(errores).toEqual([]);
  });

  test('crear un pick a mano', async ({ page }) => {
    const errores = await abrir(page);
    await page.locator('#t-tab-plus').click();
    await page.getByText('Escribir a mano').click();
    await expect(page.getByRole('heading', { name: 'Nueva apuesta' })).toBeVisible();
    const selects = page.locator('select');
    await selects.nth(0).selectOption('Fútbol');
    await selects.nth(1).selectOption('Moneyline');
    await page.getByPlaceholder(/Real Madrid vs Barcelona/).fill('Robot ML');
    await page.locator('input[type="number"]').first().fill('2');
    await page.getByPlaceholder('-110 o +150').fill('-120');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Robot ML').first()).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('cambiar de tema', async ({ page }) => {
    await abrir(page);
    await tab(page, 'Más').click();
    await page.getByText('Tema').first().click();
    await page.getByText('Todo negro').click();
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    expect(bg.toLowerCase()).toBe('#000000');
  });
});

test.describe('Amigo', () => {
  test('un amigo no ve el botón ＋ ni la sección Admin', async ({ page }) => {
    const errores = await abrir(page, 'amigo');
    await expect(page.locator('#t-tab-plus')).toHaveCount(0);
    await tab(page, 'Más').click();
    await expect(page.getByText('Respaldo para Excel')).toHaveCount(0);
    expect(errores).toEqual([]);
  });
});

// Capturas para revisar a ojo cómo se ve la app (se guardan como "capturas" en GitHub Actions)
test.describe('Capturas', () => {
  test('pantallas principales', async ({ page }, info) => {
    const n = info.project.name.replace(/\W+/g, '-');
    await abrir(page);
    await page.screenshot({ path: `capturas/${n}-inicio.png` });
    await page.getByText('Pumas ML').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `capturas/${n}-pick.png` });
    await tab(page, 'Anual').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `capturas/${n}-anual.png`, fullPage: true });
    await tab(page, 'Más').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `capturas/${n}-mas.png`, fullPage: true });
    await page.getByText('Compartir mi mes').click();
    await page.waitForTimeout(1500);
    const img = page.locator('img[src^="data:image/png"]').first();
    await expect(img).toBeVisible();
    await img.screenshot({ path: `capturas/${n}-compartir.png` });
  });
});

test.describe('Android: botón atrás', () => {
  test('cierra la hoja, luego vuelve a Inicio', async ({ page }, info) => {
    test.skip(!/Android|Pixel/i.test(info.project.name), 'Solo en Android');
    const errores = await abrir(page);
    await tab(page, 'Más').click();
    await page.getByText('Tema', { exact: true }).first().click();
    await expect(page.getByText('Todo negro')).toBeVisible();
    await page.evaluate(() => history.back());
    await expect(page.getByText('Todo negro')).toHaveCount(0);
    await expect(page.getByText('Respaldo para Excel')).toBeVisible(); // sigue en Más
    await page.evaluate(() => history.back());
    await expect(page.getByText(/Picks de /).first()).toBeVisible(); // volvió a Inicio
    expect(errores).toEqual([]);
  });
});

test.describe('Abrir y cerrar picks calificados solos', () => {
  test('pick con partido y AUTO se abre y se cierra', async ({ page }, info) => {
    const errores = await abrir(page);
    await page.evaluate(async () => {
      const hoy = new Date(); const f = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
      const ev = { id: 'x1', k: 'baseball/mlb', f: f.replace(/-/g, ''), t: hoy.toISOString(), h: { n: 'Dodgers', full: 'Los Angeles Dodgers', a: 'LAD' }, a: { n: 'Brewers', full: 'Milwaukee Brewers', a: 'MIL' }, fin: { hs: '4', as: '6' } };
      await firebase.firestore().collection('apuestas').add({ id: 999001, fecha: f, deporte: 'Béisbol', tipo: 'Moneyline', descripcion: 'Probador ML', partido: 'Brewers @ Dodgers', monto: 3, cuota: -150, resultado: 'Perdida', auto: true, evento: ev });
      await firebase.firestore().collection('apuestas').add({ id: 999002, fecha: f, deporte: 'Béisbol', tipo: 'Moneyline', descripcion: 'Segundo ML', partido: 'Brewers @ Dodgers', monto: 3, cuota: -150, resultado: 'Perdida', auto: true, evento: ev });
    });
    const n = info.project.name;
    await page.getByText('Probador ML').first().click();
    await expect(page.getByText(/Apostado/i).first()).toBeVisible();
    await page.screenshot({ path: `capturas/${n}-abierto.png` });
    await page.getByText('Probador ML').first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `capturas/${n}-cerrado.png` });
    await expect(page.getByText(/Apostado/i)).toHaveCount(0, { timeout: 3000 });
    await page.getByText('Segundo ML').first().click();
    await page.waitForTimeout(400);
    await page.getByText('Segundo ML').first().click();
    await expect(page.getByText(/Apostado/i)).toHaveCount(0, { timeout: 3000 });
    expect(errores).toEqual([]);
  });
});

test.describe('Anual con resumen por mes', () => {
  test('da el mismo balance leyendo resúmenes que leyendo todos los picks', async ({ page }) => {
    const errores = await abrir(page);
    await tab(page, 'Anual').click();
    const balance = page.getByText(/BALANCE \d{4}/).locator('xpath=following-sibling::*[1]');
    await expect(page.getByText(/BALANCE \d{4}/)).toBeVisible();
    await page.waitForTimeout(2000); // el número se anima al aparecer
    const antes = await balance.innerText();
    const todos = await page.getByText(/Todos los picks de \d{4}/).innerText();
    // El admin escribe los resúmenes de los meses que tiene cargados
    await page.waitForFunction(() => (localStorage.getItem('alexpicks-prueba-db') || '').includes('resumen-'), null, { timeout: 15000 });
    // Al volver a abrir, Anual ya usa los resúmenes en vez de bajar cada mes
    await page.goto('/?prueba=1&rol=admin');
    await expect(page.getByText(/GANANCIA DE|RESULTADO DE/).first()).toBeVisible({ timeout: 20000 });
    await tab(page, 'Anual').click();
    await page.waitForTimeout(800);
    await expect(balance).toHaveText(antes);
    await expect(page.getByText(/Todos los picks de \d{4}/)).toHaveText(todos);
    expect(errores).toEqual([]);
  });
});

test.describe('La metí', () => {
  test('tocar muchas veces seguidas deja el último estado y se guarda', async ({ page }) => {
    const errores = await abrir(page, 'amigo');
    await page.getByText('Rays ML').first().click();
    const sw = page.getByRole('button', { name: /La metí|No la metí/ }).first();
    await expect(sw).toBeVisible();
    for (let i = 0; i < 5; i++) await sw.click(); // 5 toques: termina en "No la metí"
    await expect(page.getByText('No la metí').first()).toBeVisible();
    await page.waitForTimeout(1500);
    await page.goto('/?prueba=1&rol=amigo');
    await expect(page.getByText(/GANANCIA DE|RESULTADO DE/).first()).toBeVisible({ timeout: 20000 });
    await page.getByText('Rays ML').first().click();
    await expect(page.getByText('No la metí').first()).toBeVisible();
    expect(errores).toEqual([]);
  });
});

test.describe('Compartir un pick', () => {
  test('a un amigo no le sale el botón', async ({ page }) => {
    await abrir(page, 'amigo');
    await page.getByText('Rays ML').first().click();
    await expect(page.getByText(/Apostado/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compartir pick' })).toHaveCount(0);
  });
  test('arma la imagen en historia y cuadrada', async ({ page }, info) => {
    const errores = await abrir(page);
    await page.evaluate(async () => {
      const h = new Date(); const f = h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0') + '-' + String(h.getDate()).padStart(2, '0');
      const ev = { id: 'x1', k: 'baseball/mlb', f: f.replace(/-/g, ''), t: new Date(h.getTime() + 3600e3).toISOString(), liga: 'MLB', h: { n: 'Dodgers', full: 'Los Angeles Dodgers', a: 'LAD', c: '#005a9c' }, a: { n: 'Brewers', full: 'Milwaukee Brewers', a: 'MIL', c: '#12284b' } };
      await firebase.firestore().collection('apuestas').add({ id: 999001, fecha: f, deporte: 'Béisbol', tipo: 'Moneyline', descripcion: 'Dodgers ML', partido: 'Brewers @ Dodgers', monto: 2, cuota: -150, resultado: 'Pendiente', evento: ev });
      await firebase.firestore().collection('apuestas').add({ id: 999002, fecha: f, deporte: 'Béisbol', tipo: 'Moneyline', descripcion: 'Dodgers ganan con carrera de diferencia o más', partido: 'Brewers @ Dodgers', monto: 2, cuota: 120, resultado: 'Ganada', evento: { ...ev, id: 'x2', fin: { hs: '5', as: '3' } } });
    });
    const n = info.project.name;
    await page.getByText('Dodgers ML').first().click();
    await page.getByRole('button', { name: 'Compartir pick' }).first().click();
    const img = page.locator('img[alt="Vista previa"]');
    await expect(img).toBeVisible({ timeout: 10000 });
    await img.screenshot({ path: `capturas/${n}-pick-historia.png` });
    await page.getByRole('button', { name: 'Cuadrada', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Compartir', exact: true })).toBeEnabled({ timeout: 10000 });
    await expect(img).toBeVisible();
    // La cuadrada debe ser 1080×1350, no la de historia
    const tam = await img.evaluate(i => i.naturalWidth + 'x' + i.naturalHeight);
    expect(tam).toBe('1080x1350');
    await page.goto('/?prueba=1&rol=admin');
    await expect(page.getByText(/GANANCIA DE|RESULTADO DE/).first()).toBeVisible({ timeout: 20000 });
    await page.getByText('Dodgers ganan con carrera').first().click();
    await page.getByRole('button', { name: 'Compartir pick' }).first().click();
    await expect(page.getByRole('button', { name: 'Compartir', exact: true })).toBeEnabled({ timeout: 10000 });
    await img.screenshot({ path: `capturas/${n}-pick-ganado-cuadrada.png` });
    await img.screenshot({ path: `capturas/${n}-pick-cuadrada.png` });
    // El partido inventado hace que la app pida el marcador al Worker desde el servidor del robot (Cloudflare lo bloquea ahí; en la app real no)
    expect(errores.filter(e => !/access control|marcador/.test(e))).toEqual([]);
  });
});

test.describe('Picks de jugador', () => {
  test('lee jugador, estadística y línea en los 4 deportes', async ({ page }) => {
    await abrir(page);
    const r = await page.evaluate(() => {
      const v = j => ({ hs: '1', as: '0', st: 'in', j });
      const P = (d, k, j) => { const x = pistaPick({ descripcion: d }, { k, h: { n: 'Local' }, a: { n: 'Visita' } }, v(j)); return x ? x.txt : null; };
      return {
        mlb: P('Shohei Ohtani más de 0.5 hits', 'baseball/mlb', [{ n: 'Shohei Ohtani', s: { h: 1 } }]),
        so: P('Yamamoto over 6.5 strikeouts', 'baseball/mlb', [{ n: 'Yoshinobu Yamamoto', s: { k: 5 } }]),
        nba: P('Brunson over 25.5 puntos', 'basketball/nba', [{ n: 'Jalen Brunson', s: { pts: 28 } }]),
        nfl: P('Walker TD', 'football/nfl', [{ n: 'Kenneth Walker III', s: { rutd: 0 } }]),
        fut: P('Guillermo Martínez más de 1.5 remates a puerta', 'soccer/mex.1', [{ n: 'Guillermo Martínez', s: { sot: 1 } }]),
        dudoso: P('Smith más de 0.5 hits', 'baseball/mlb', [{ n: 'Will Smith', s: { h: 1 } }, { n: 'Joey Smith', s: { h: 0 } }]),
        auto: resultadoAuto({ resultado: 'Pendiente', descripcion: 'Ohtani más de 0.5 hits', evento: { id: 'e', k: 'baseball/mlb', h: { n: 'Local' }, a: { n: 'Visita' } } }, { e: { st: 'post', hs: '1', as: '0', det: 'Final', j: [{ n: 'Shohei Ohtani', s: { h: 2 } }] } }),
      };
    });
    expect(r.mlb).toBe('¡Ganaste! · Ohtani 1 hit');
    expect(r.so).toBe('Yamamoto · 5 de 7 strikeouts');
    expect(r.nba).toBe('¡Ganaste! · Brunson 28 puntos');
    expect(r.nfl).toBe('Walker · 0 de 1 touchdown');
    expect(r.fut).toBe('Martínez · 1 de 2 remates a puerta');
    expect(r.dudoso).toBeNull();
    expect(r.auto).toBeNull(); // los de jugador nunca se califican solos
  });
});

test.describe('Dónde ganas más', () => {
  test('el admin la ve en Anual y cambia entre liga, tipo y momio', async ({ page }, info) => {
    const errores = await abrir(page);
    await tab(page, 'Anual').click();
    await expect(page.getByRole('heading', { name: 'Dónde ganas más' })).toBeVisible();
    await page.getByRole('button', { name: 'Tipo', exact: true }).click();
    await expect(page.getByText('Moneyline').first()).toBeVisible();
    await page.getByRole('button', { name: 'Momio', exact: true }).click();
    await expect(page.getByText(/Favorito|Parejo|Underdog/).first()).toBeVisible();
    await page.getByRole('button', { name: /^Todo \d{4}$/ }).click();
    await page.waitForTimeout(800);
    const sec = page.getByRole('heading', { name: 'Dónde ganas más' }).locator('xpath=..');
    await sec.screenshot({ path: `capturas/${info.project.name}-donde.png` });
    expect(errores).toEqual([]);
  });
  test('a un amigo no le sale', async ({ page }) => {
    await abrir(page, 'amigo');
    await tab(page, 'Anual').click();
    await expect(page.getByText(/BALANCE \d{4}/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dónde ganas más' })).toHaveCount(0);
  });
});
