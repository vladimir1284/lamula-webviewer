import { expect, test } from '@playwright/test'

test.describe('Feedback Flow', () => {
  test('abrir feedback desde pill/menú, enviar comentario y consultar en Mis mensajes', async ({ page }) => {
    await page.goto('/AMX/94/20260711T030818')
    await page.waitForLoadState('networkidle')

    // Abrir menú de capas
    await page.getByTestId('layers-menu-toggle').click()
    const layersMenu = page.getByTestId('layers-menu')
    await expect(layersMenu).toBeVisible()

    // Clic en el pill o botón de feedback
    const feedbackPill = page.getByTestId('feedback-pill')
    if (await feedbackPill.isVisible()) {
      await feedbackPill.click()
    }
    else {
      const menuFeedbackBtn = page.getByTestId('menu-feedback-open')
      await expect(menuFeedbackBtn).toBeVisible()
      await menuFeedbackBtn.click()
    }

    const dialog = page.getByTestId('feedback-dialog')
    await expect(dialog).toBeVisible({ timeout: 10000 })

    // Llenar formulario
    await page.getByTestId('feedback-role-select').selectOption('meteorologo')
    await page.getByTestId('feedback-kind-select').selectOption('mejora')
    await page.getByTestId('rating-star-5').click()
    await page.getByTestId('feedback-message-input').fill('Mensaje de prueba e2e sobre el visor de radar')

    // Enviar
    const submitBtn = page.getByTestId('feedback-submit-btn')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Al enviar con éxito, la máquina cambia automáticamente activeTab a 'mine'
    const mineTab = page.getByTestId('feedback-tab-mine')
    await expect(mineTab).toHaveClass(/border-teal-400/, { timeout: 10000 })

    // Verificar que el mensaje enviado aparece en la lista
    const threadItems = page.getByTestId('feedback-item-thread')
    await expect(threadItems).toHaveCount(1, { timeout: 10000 })
    await expect(threadItems.first()).toContainText('Mensaje de prueba e2e sobre el visor de radar')

    // Cerrar diálogo
    await page.getByTestId('feedback-dialog-close').click()
    await expect(dialog).not.toBeVisible()
  })
})
