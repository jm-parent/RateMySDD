import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginScreen } from '../../src/web/components/LoginScreen.js';
import { NoCopilotAccess } from '../../src/web/components/NoCopilotAccess.js';
import { UserBar } from '../../src/web/components/UserBar.js';

const user = {
  login: 'octo',
  name: 'Octo Cat',
  avatarUrl: 'https://avatars.example/octo',
  copilotAccess: 'active' as const,
};

describe('authentication components', () => {
  it('renders a safe GitHub device-flow sign-in entry point', () => {
    const html = renderToStaticMarkup(
      createElement(LoginScreen, { onAuthenticated: () => undefined }),
    );
    expect(html).toContain('RateMySDD — Audit de spécifications');
    expect(html).toContain('Se connecter avec GitHub Copilot');
    expect(html).toContain('Se connecter avec GitHub Copilot');
    expect(html).toContain('Diagnostic administrateur');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders user identity and an accessible sign-out action', () => {
    const html = renderToStaticMarkup(
      createElement(UserBar, { user, onLoggedOut: () => undefined }),
    );

    expect(html).toContain('alt="octo"');
    expect(html).toContain('Octo Cat');
    expect(html).toContain('aria-label="Se déconnecter"');
    expect(html).toContain('title="Se déconnecter"');
    expect(html).toContain('class="user-bar-logout"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('>Se déconnecter</button>');
  });

  it('renders branded identity and the authenticated account in the header', () => {
    const html = renderToStaticMarkup(
      createElement(UserBar, {
        user,
        onLoggedOut: () => undefined,
        showBrandHeading: true,
      }),
    );
    const brandIndex = html.indexOf('class="user-brand"');
    const accountIndex = html.indexOf('class="user-account"');
    const logoutIndex = html.indexOf('aria-label="Se déconnecter"');

    expect(brandIndex).toBeGreaterThanOrEqual(0);
    expect(accountIndex).toBeGreaterThan(brandIndex);
    expect(logoutIndex).toBeGreaterThan(accountIndex);
    expect(html).toContain(
      '<span class="brand-mark" aria-hidden="true">R</span>',
    );
    expect(html).toContain('RateMySDD');
    expect(html).toContain('Octo Cat');
    expect(html).toContain('GitHub Copilot');
    expect(html).toContain('<h1 id="audit-page-title"');
    expect(html).toContain('>RateMySDD</h1>');
    expect(html).not.toContain('Audit de spécifications');
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
  });

  it('explains missing Copilot access and offers sign-out', () => {
    const html = renderToStaticMarkup(
      createElement(NoCopilotAccess, { onLoggedOut: () => undefined }),
    );

    expect(html).toContain('L&#x27;audit nécessite un abonnement GitHub Copilot actif.');
    expect(html).toContain('Se déconnecter');
  });
});
