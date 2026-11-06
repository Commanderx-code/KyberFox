"""Stands in for the Plasma notification server in a virtual KWin session,
where plasmashell has no panel and so does not own the name. It answers the
same org.freedesktop.Notifications calls and logs each Notify."""
import sys
from gi.repository import Gio, GLib

XML = """<node><interface name="org.freedesktop.Notifications">
<method name="GetCapabilities"><arg type="as" direction="out"/></method>
<method name="Notify"><arg type="s" direction="in"/><arg type="u" direction="in"/>
<arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="in"/>
<arg type="as" direction="in"/><arg type="a{sv}" direction="in"/><arg type="i" direction="in"/>
<arg type="u" direction="out"/></method>
<method name="CloseNotification"><arg type="u" direction="in"/></method>
<method name="GetServerInformation"><arg type="s" direction="out"/><arg type="s" direction="out"/>
<arg type="s" direction="out"/><arg type="s" direction="out"/></method>
<signal name="NotificationClosed"><arg type="u"/><arg type="u"/></signal>
<signal name="ActionInvoked"><arg type="u"/><arg type="s"/></signal>
</interface></node>"""
log = open(sys.argv[1], "w", buffering=1)


def call(conn, sender, path, iface, method, params, inv):
    if method == "GetCapabilities":
        inv.return_value(GLib.Variant("(as)", (["actions", "body", "body-markup", "icon-static"],)))
    elif method == "GetServerInformation":
        inv.return_value(GLib.Variant("(ssss)", ("Plasma", "KDE", "6.8.2", "1.2")))
    elif method == "Notify":
        app, _id, icon, summary, body, actions, hints, timeout = params.unpack()
        log.write(f"NOTIFY app={app!r} icon={icon!r} summary={summary!r} body={body!r} "
                  f"actions={actions!r} hints={ {k: v for k, v in hints.items() if k != 'image-data'} }\n")
        inv.return_value(GLib.Variant("(u)", (1,)))
    else:
        inv.return_value(None)


def acquired(conn, name):
    node = Gio.DBusNodeInfo.new_for_xml(XML)
    conn.register_object("/org/freedesktop/Notifications", node.interfaces[0], call, None, None)
    log.write("ready\n")


Gio.bus_own_name(Gio.BusType.SESSION, "org.freedesktop.Notifications", 0, acquired, None, None)
GLib.MainLoop().run()
