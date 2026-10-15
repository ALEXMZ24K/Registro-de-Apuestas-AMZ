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
      };
    });
    expect(r.dec140).toBe('1.714');
    expect(r.dec150).toBe('2.50');
    expect(r.gan).toBe('1.429');
    expect(r.per).toBe(-2);
    expect(r.nula).toBe(0);
    expect(r.ml).toBe('Va arriba');
    expect(r.over).toBe('2 de 3 goles');
    expect(r.overGanado).toContain('¡Ganaste!');
    expect(r.spread).toBe('No cubre todavía');
    expect(r.btts).toBe('Falta que anote Tigres');
    expect(r.remates).toContain('¡Ganaste!');
    expect(r.jugador).toBeNull();
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
