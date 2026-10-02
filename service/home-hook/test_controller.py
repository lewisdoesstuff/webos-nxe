import json
import unittest

import controller


class ParseTests(unittest.TestCase):
    def test_ready(self):
        message = controller.parse_message(b"LGXMB_HOME 1 READY abc 12 345 lginput 6789")
        self.assertEqual(message, ("READY", "abc", 12, 345, 6789))

    def test_home_only_on_press(self):
        press = controller.parse_message(b"LGXMB_HOME 1 HOME abc 12 345 773 1 6789")
        release = controller.parse_message(b"LGXMB_HOME 1 HOME abc 12 345 773 0 6789")
        self.assertEqual(press, ("HOME", "abc", 12, 345, 773, 6789))
        self.assertIsNone(release)

    def test_rejects_malformed(self):
        for data in (b"", b"LGXMB_HOME 2 READY a 1 2 write 3", b"LGXMB_HOME 1 READY a x 2 write 3",
                     b"LGXMB_HOME 1 READY a 1 2 bogus 3", b"\xff\xfe"):
            self.assertIsNone(controller.parse_message(data))

    def test_foreground_ids(self):
        chunk = b'{\n "appId": "ooo.lew.nxe",\n "x": 1\n}\n{\n "appId": "",\n}\n{ "appId": "com.webos.app.home" }'
        self.assertEqual(controller.foreground_ids(chunk), ["ooo.lew.nxe", "", "com.webos.app.home"])

    def test_lease_format(self):
        self.assertEqual(controller.lease_text("abc", 1.5), "LGXMB_HOME 1 abc 1500\n")

    def test_binds_added_beside_user_bindings(self):
        user = {"1": {"action": "ignore"}, "773": {"action": "launch", "id": "x.y"}}
        result, changed = controller.reconcile_binds(user, True)
        self.assertTrue(changed)
        self.assertEqual(result["1"], {"action": "ignore"})
        self.assertEqual(result["773"], {"action": "launch", "id": "x.y"})
        for code in ("125", "774"):
            self.assertTrue(controller.is_ours(result[code]))

    def test_binds_idempotent_and_removable(self):
        once, _ = controller.reconcile_binds({}, True)
        again, changed = controller.reconcile_binds(once, True)
        self.assertFalse(changed)
        gone, changed = controller.reconcile_binds(dict(once, **{"9": {"action": "ignore"}}), False)
        self.assertTrue(changed)
        self.assertEqual(gone, {"9": {"action": "ignore"}})

    def test_launch_command_is_valid_shell_json(self):
        command = controller.launch_command()
        quoted = command.split("'")[1]
        self.assertEqual(json.loads(quoted)["params"], {"home": True})


if __name__ == "__main__":
    unittest.main()
