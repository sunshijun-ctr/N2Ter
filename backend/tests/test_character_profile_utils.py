from app.services.character_profile_utils import (
    ensure_character_profiles,
    format_shot_label,
    resolve_character_ref,
)


def test_resolve_character_ref_uses_profiles() -> None:
    id_map = {"char_01": "林晚", "char_02": "沈云洲"}
    assert resolve_character_ref("char_02", id_map) == "沈云洲"
    assert resolve_character_ref("林晚", id_map) == "林晚"


def test_format_shot_label_parses_technical_id() -> None:
    label = format_shot_label(
        {"shot_id": "ep2_sc1_sh3"},
        scene_index=9,
        shot_index=9,
        episode_num=2,
    )
    assert label == "第 2 集 · 场景 1 · 镜头 3"


def test_ensure_character_profiles_from_arcs() -> None:
    content = ensure_character_profiles(
        {"scenes": []},
        [{"name": "林晚"}, {"name": "沈云洲"}],
    )
    profiles = content["character_profiles"]
    assert profiles[0]["id"] == "char_01"
    assert profiles[0]["name"] == "林晚"
    assert profiles[1]["name"] == "沈云洲"


def test_semantic_character_ids_resolve_from_arcs() -> None:
    from app.services.character_profile_utils import build_comprehensive_character_map

    arcs = [{"name": "吴世恭"}, {"name": "秦良玉"}]
    content = {
        "character_profiles": [
            {"id": "char_01", "name": "吴世恭"},
            {"id": "char_wu_modern", "name": "char_wu_modern"},
        ],
        "scenes": [
            {
                "shots": [
                    {"subject": "char_wu_modern", "dialogue": [{"character_id": "char_qin", "line": "嗯"}]}
                ]
            }
        ],
    }
    id_map = build_comprehensive_character_map(content, arcs)
    assert id_map["char_wu_modern"] == "吴世恭"
    assert id_map["char_qin"] == "秦良玉"
    assert resolve_character_ref("char_wu_modern", id_map) == "吴世恭"
