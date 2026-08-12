import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guarantees for the admin surface — E14-T01 to T04.
 *
 * `AdminGuard` is attached per controller rather than globally (see
 * `admin.module.ts` for why the ordering forces that). A decorator you have to
 * remember is one somebody will eventually forget on the one endpoint that
 * mattered, so this file is the thing that remembers.
 */

// Vitest runs with apps/api as its working directory.
const here = join(process.cwd(), 'src/modules/admin');

/**
 * Routes that legitimately run on an ordinary session.
 *
 * Only the MFA handshake: requiring an MFA-verified session in order to set up
 * MFA is a locked door with the key inside. Everything else must declare a
 * permission.
 */
const MFA_HANDSHAKE_ROUTES = [
  'auth/mfa/enrol',
  'auth/mfa/confirm',
  'auth/login',
  'auth/reauth',
];

function adminSources(): Array<{ name: string; content: string }> {
  return readdirSync(here)
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => ({ name: entry, content: readFileSync(join(here, entry), 'utf8') }));
}

const sources = adminSources();
const controllers = sources.filter((file) => file.content.includes('@Controller('));

describe('every admin controller is guarded (E14-T02)', () => {
  it('finds the controllers to check', () => {
    // Guards the guard: a broken path would make the assertions below pass
    // over an empty list.
    expect(sources.length).toBeGreaterThanOrEqual(6);
    expect(controllers.length).toBeGreaterThanOrEqual(1);
  });

  it('attaches AdminGuard', () => {
    for (const file of controllers) {
      expect(file.content, file.name).toContain('@UseGuards(AdminGuard)');
    }
  });

  it('declares a permission on every route that is not the MFA handshake', () => {
    // A route with no `@RequirePermission` is a route `AdminGuard` waves
    // through — it checks metadata and does nothing when there is none.
    const unguarded: string[] = [];

    for (const file of controllers) {
      // Split on route decorators, keeping each one with the block that follows.
      const blocks = file.content.split(/(?=@(?:Get|Post|Put|Patch|Delete)\()/);

      for (const block of blocks.slice(1)) {
        const route = /@(?:Get|Post|Put|Patch|Delete)\(\s*'([^']*)'/.exec(block)?.[1] ?? '';
        if (MFA_HANDSHAKE_ROUTES.includes(route)) continue;

        // Only inspect up to the next route decorator's method body start.
        const head = block.slice(0, block.indexOf('{'));
        if (!head.includes('@RequirePermission(')) {
          unguarded.push(`${file.name}: ${route || '(unnamed route)'}`);
        }
      }
    }

    expect(unguarded).toEqual([]);
  });
});

describe('audit log is append-only (E14-T03)', () => {
  const audit = sources.find((file) => file.name === 'audit.service.ts')?.content ?? '';

  it('has no update or delete of an audit row', () => {
    // An audit log an admin can edit is not evidence of anything. The
    // guarantee is that the method does not exist, not that no endpoint calls
    // it.
    expect(audit).not.toMatch(/auditLog\.(update|updateMany|delete|deleteMany|upsert)/);
  });

  it('exposes no mutating method beyond recording', () => {
    const methods = [...audit.matchAll(/^\s{2}(?:async\s+)?(\w+)\(/gm)].map((match) => match[1]);

    for (const method of methods) {
      expect(method, `AuditService.${method}`).not.toMatch(/^(update|delete|remove|purge|edit)/);
    }
  });

  it('is not exposed for mutation through a controller either', () => {
    for (const file of controllers) {
      expect(file.content, file.name).not.toMatch(
        /@(?:Delete|Put|Patch)\(\s*'admin\/audit|@(?:Delete|Put|Patch)\(\s*'audit/,
      );
    }
  });
});

describe('CSV export bypasses the response envelope (E14-T03)', () => {
  const controller = sources.find((file) => file.name === 'admin.controller.ts')?.content ?? '';

  it('writes the export through the response object', () => {
    // The global ResponseInterceptor wraps returned values in
    // {data, meta, error}. A CSV whose first line is JSON is not a CSV, and
    // setting the content type alone does not stop the wrapping.
    const block = controller.slice(controller.indexOf("@Get('audit/export')"));
    expect(block).toContain('@Res()');
    expect(block).toContain('text/csv');
  });
});

describe('private content is case-gated (E14-T04)', () => {
  const service = sources.find((file) => file.name === 'private-content.service.ts')?.content ?? '';

  it('is the only place that reads a message body', () => {
    // The invariant is about *bodies*, not about the table. Resolving which
    // account sent a reported message is legitimate — a case about a message
    // has to be actionable — so the check is on what the query selects.
    //
    // If any other admin file could select a body, the case gate would be one
    // route away from being decorative.
    const others = sources.filter((file) => file.name !== 'private-content.service.ts');
    const offenders: string[] = [];

    for (const file of others) {
      // Every `prisma.message.<op>({ ... })` call, with its selection.
      for (const call of file.content.matchAll(/prisma\.message\.\w+\(\{[\s\S]*?\n\s*\}\)/g)) {
        if (/\bbody\b/.test(call[0])) offenders.push(`${file.name}: ${call[0].slice(0, 60)}…`);
      }

      // And no eager-loading of the messages relation, which would carry
      // bodies without ever naming them.
      if (/messages:\s*\{/.test(file.content)) offenders.push(`${file.name}: messages relation`);
    }

    expect(offenders).toEqual([]);
  });

  it('writes the audit row before returning content', () => {
    // Ordering, asserted on source because it cannot be observed from outside:
    // a crash between the two would leave an access with no record, and the
    // accesses worth hiding are the ones somebody would interrupt.
    const auditAt = service.indexOf("action: 'admin.private_content.opened'");
    const returnAt = service.indexOf('return {\n      roomId:');

    expect(auditAt).toBeGreaterThan(-1);
    expect(returnAt).toBeGreaterThan(-1);
    expect(auditAt).toBeLessThan(returnAt);
  });

  it('checks the case actually points at the room', () => {
    // Without this, any open case anywhere is a skeleton key for every private
    // conversation on the platform.
    expect(service).toContain('case_target_mismatch');
    expect(service).toContain('roomId !== request.targetId');
  });

  it('refuses a closed case', () => {
    expect(service).toContain("moderationCase.status === 'resolved'");
    expect(service).toContain('case_closed');
  });

  it('logs refused attempts, not only successful ones', () => {
    // A pattern of denials is a stronger signal than a success, and it leaves
    // no trace at all if only successes are recorded.
    expect(service).toContain("action: 'admin.private_content.denied'");
  });

  it('never returns the identity of a message sender', () => {
    expect(service).toContain('senderRole');
    expect(service).not.toMatch(/senderId:\s*message\.senderId/);
    expect(service).not.toMatch(/senderAlias/);
  });
});

describe('MFA cannot be bypassed (E14-T01)', () => {
  const guard = sources.find((file) => file.name === 'admin.guard.ts')?.content ?? '';
  const auth = sources.find((file) => file.name === 'admin-auth.service.ts')?.content ?? '';

  it('checks MFA on every permissioned route', () => {
    expect(guard).toContain('isMfaSatisfied');
    expect(guard).toContain('ADMIN_MFA_REQUIRED');
  });

  it('re-reads the role from the database rather than the token', () => {
    // A role revoked five minutes ago must not keep working for the fifteen
    // minutes an access token stays valid.
    expect(guard).toContain('prisma.user.findUnique');
    expect(guard).not.toMatch(/user\.role/);
  });

  it('issues the admin session only after the code is verified', () => {
    const verifyAt = auth.indexOf('const step = await this.consumeCode');
    const issueAt = auth.indexOf('await this.sessions.issue');

    expect(verifyAt).toBeGreaterThan(-1);
    expect(issueAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(issueAt);
  });

  it('records the consumed TOTP step so a code cannot be replayed', () => {
    expect(auth).toContain('mfaLastStep');
    expect(auth).toContain('step <= lastStep');
  });

  it('fails closed when the lockout counter is unavailable', () => {
    // The only counter in this codebase that does. It is the one thing between
    // a stolen inbox and unlimited guesses at six digits.
    expect(auth).toContain('refusing login');
    expect(auth).toMatch(/catch[\s\S]{0,400}ApiException\.unavailable/);
  });
});
