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


if __name__ == "__main__":
    unittest.main()
