import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import type Gio from 'gi://Gio?version=2.0';

/** Niri-style overlay listing the AlbumWM keybindings (read-only). */

let overlay: ModalDialog.ModalDialog | null;

/** Schema keys grouped like the schema sections. */
const GROUPS: Array<[string, string[]]> = [
    [
        'General',
        [
            'show-shortcuts',
            'close-window',
            'fullscreen-window-toggle',
            'cycle-focus-modes',
        ],
    ],
    [
        'Window movements',
        [
            'focus-column-left',
            'focus-column-right',
            'focus-column-first',
            'focus-column-last',
            'focus-window-up',
            'focus-window-down',
            'focus-window-down-or-column-right',
            'focus-window-up-or-column-left',
            'move-column-left',
            'move-column-right',
            'move-window-up',
            'move-window-down',
            'center-column',
        ],
    ],
    [
        'Window resizing',
        [
            'maximize-column-toggle',
            'inc-column-width',
            'dec-column-width',
            'inc-window-height',
            'dec-window-height',
            'cycle-preset-column-width',
            'cycle-preset-column-width-backwards',
            'cycle-preset-window-height',
            'cycle-preset-window-height-backwards',
        ],
    ],
    [
        'Column management',
        [
            'consume-or-expel-window-left',
            'consume-or-expel-window-right',
            'consume-window-into-column',
            'expel-window-from-column',
        ],
    ],
    [
        'Monitors',
        [
            'focus-monitor-left',
            'focus-monitor-right',
            'focus-monitor-above',
            'focus-monitor-below',
            'move-window-to-monitor-left',
            'move-window-to-monitor-right',
            'move-window-to-monitor-above',
            'move-window-to-monitor-below',
        ],
    ],
    [
        'Floating layer',
        ['toggle-window-floating', 'switch-focus-between-floating-and-tiling'],
    ],
];

/** Keysyms with printable glyphs. */
const KEY_LABELS: { [keysym: string]: string } = {
    slash: '/',
    comma: ',',
    period: '.',
    plus: '+',
    minus: '-',
    equal: '=',
    underscore: '_',
};

/** `<Super><Shift>slash` -> `Super+Shift+/` */
export function prettify(keystr: string) {
    const match = keystr.match(/^((?:<[^>]+>)*)(.*)$/);
    if (!match) return keystr;

    const mods = (match[1].match(/<[^>]+>/g) ?? []).map(t =>
        t
            .slice(1, -1)
            .toLowerCase()
            .replace(/^primary$/, 'ctrl')
            .replace(/^./, c => c.toUpperCase())
    );
    const key = match[2];

    return [...mods, KEY_LABELS[key] ?? key].join('+');
}

/** Unlisted schema keys land in "Other". */
function groups(settings: Gio.Settings): Array<[string, string[]]> {
    const grouped = new Set(GROUPS.flatMap(([_, keys]) => keys));
    const other = settings
        .list_keys()
        .filter(
            key =>
                !grouped.has(key) &&
                settings.get_value(key).get_type_string() === 'as'
        )
        .sort();

    return other.length ? [...GROUPS, ['Other', other]] : GROUPS;
}

function makeRow(
    settings: Gio.Settings,
    key: string,
    combos: string[]
): St.Widget {
    const summary = settings.settings_schema.get_key(key).get_summary() || key;
    const row = new St.BoxLayout({ style: 'spacing: 24px;' });
    row.add_child(new St.Label({ text: summary, x_expand: true }));
    row.add_child(
        new St.Label({
            text: combos.map(prettify).join(',  '),
            style_class: 'dim-label',
            y_align: Clutter.ActorAlign.CENTER,
        })
    );
    return row;
}

function buildContent(settings: Gio.Settings): St.Widget {
    const content = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 14px; padding-right: 20px;',
    });

    for (const [name, keys] of groups(settings)) {
        const group = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style: 'spacing: 6px;',
        });
        let rows = 0;
        for (const key of keys) {
            const combos = settings.get_strv(key);
            if (!combos.length) continue;
            group.add_child(makeRow(settings, key, combos));
            rows++;
        }
        if (!rows) continue;

        content.add_child(
            new St.Label({ text: name, style_class: 'headline' })
        );
        content.add_child(group);
    }

    const height = Math.min(
        560,
        Math.floor((Main.layoutManager.primaryMonitor?.height ?? 1600) * 0.65)
    );
    return new St.ScrollView({
        child: content,
        overlay_scrollbars: true,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        hscrollbar_policy: St.PolicyType.NEVER,
        style: `width: 640px; max-height: ${height}px;`,
    });
}

export function show(settings: Gio.Settings) {
    if (overlay) return;

    const dialog = new ModalDialog.ModalDialog();
    dialog.contentLayout.add_child(buildContent(settings));
    dialog.addButton({ label: 'Close', action: () => hide() });

    // ModalDialog doesn't close on Escape.
    dialog.connect('key-press-event', (_widget, event) => {
        if (event.get_key_symbol() !== Clutter.KEY_Escape)
            return Clutter.EVENT_PROPAGATE;
        hide();
        return Clutter.EVENT_STOP;
    });

    overlay = dialog;
    dialog.open();
}

export function hide() {
    if (!overlay) return;
    const dialog = overlay;
    overlay = null;
    dialog.close();
}

export function toggle(settings: Gio.Settings) {
    if (overlay) hide();
    else show(settings);
}

export function disable() {
    hide();
}
