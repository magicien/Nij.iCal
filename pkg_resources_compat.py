"""setuptools>=82 で削除された pkg_resources の最小互換シム。

twitter-text-parser 3.0.0 が twitter_text/regexp/emoji.py で
pkg_resources.resource_string() を使って同梱の emoji-test.txt を
読み込んでいるが、pkg_resources は setuptools 82.0.0 で削除された。
上流に修正版が無いため、こちら側で後継の importlib.resources に
委譲する代替モジュールを sys.modules に登録して互換性を保つ。

このモジュールは twitter_text より前に import すること。

twitter-text-parser が更新されるか別ライブラリへ移行した時点で削除可。
参照: https://github.com/magicien/Nij.iCal/security/dependabot/12
"""
import sys
import types
from importlib.resources import files

try:
    import pkg_resources  # noqa: F401
except ModuleNotFoundError:
    _m = types.ModuleType("pkg_resources")
    _m.resource_string = lambda package, resource: (files(package) / resource).read_bytes()
    sys.modules["pkg_resources"] = _m
