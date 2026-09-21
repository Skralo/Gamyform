import type { Experience } from "../domain";
import type { Copy } from "./copy";
import { Panel, type PanelActions, type PanelView } from "./Panel";
import { themeVars } from "./theme";

/** The same glass panel, flat, over a soft gradient: the no-3D and accessible path. */
export function StandardView({
  view,
  actions,
  t,
  exp,
  badge,
}: {
  view: PanelView;
  actions: PanelActions;
  t: Copy;
  exp: Experience;
  badge: string;
}) {
  return (
    <div className="gf-root gf-standard" style={themeVars(exp)}>
      <div className="gf-backdrop" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      {badge && <div className="gf-chip">{badge}</div>}
      <main className="gf-standard-stage">
        <Panel view={view} actions={actions} t={t} />
      </main>
    </div>
  );
}
