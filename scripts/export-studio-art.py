#!/usr/bin/env python3
"""Export only the validated, saved Studio art library; never modify its place."""

import copy
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "build/WarWorldArt.rbxlx"
OUTPUT = ROOT / "assets/original/world-kit/WorldArtLibrary.rbxmx"
EXPECTED_PARTS = {
    "CoastalPine": 5,
    "CoastalRock": 2,
    "SupplyCrate": 3,
    "ScrapPile": 2,
}
MAX_XML_BYTES = 16 * 1024 * 1024
ASSET_ID = re.compile(r"rbxassetid://([1-9][0-9]*)\Z")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def parse_xml(path):
    require(path.stat().st_size <= MAX_XML_BYTES, "XML exceeds the 16 MiB limit")
    data = path.read_bytes()
    require(len(data) <= MAX_XML_BYTES, "XML exceeds the 16 MiB limit")
    require(
        b"<!DOCTYPE" not in data.upper() and b"<!ENTITY" not in data.upper(),
        "DTD/entity declarations are not allowed",
    )
    root = ET.fromstring(data)
    require(root.tag == "roblox" and root.get("version") == "4", "Expected Roblox XML v4")
    require(sum(1 for _ in root.iter()) <= 100000, "XML exceeds the element limit")
    return root


def name(item):
    return item.findtext("Properties/string[@name='Name']")


def one(elements, description):
    require(len(elements) == 1, "Expected exactly one " + description)
    return elements[0]


def asset_id(part, property_name):
    # Rojo upgrades Studio's legacy MeshId/TextureID URLs to Content URI fields.
    property_names = {
        "MeshId": ("MeshId", "MeshContent"),
        "TextureID": ("TextureID", "TextureContent"),
    }[property_name]
    content = one(
        [
            prop
            for prop in part.findall("Properties/Content")
            if prop.get("name") in property_names
        ],
        "%s on %s" % (property_name, name(part)),
    )
    require(
        len(content) == 1 and content[0].tag in {"url", "uri"},
        "%s must contain one asset URL" % property_name,
    )
    match = ASSET_ID.fullmatch(content[0].text or "")
    require(match is not None, "%s requires a nonzero numeric rbxassetid URL" % property_name)
    return match.group(1)


def validate_library(library, document):
    require(library.get("class") == "Folder", "WorldArtLibrary must be a Folder")
    require(name(library) == "WorldArtLibrary", "Incorrect library name")
    templates = library.findall("Item")
    require(
        len(templates) == len(EXPECTED_PARTS)
        and {name(item) for item in templates} == set(EXPECTED_PARTS),
        "Library must have exactly the four expected direct children",
    )
    require(all(item.get("class") == "Model" for item in templates), "Templates must be Models")
    items = list(library.iter("Item"))
    require(len(items) <= 128, "Library exceeds the instance limit")
    require(
        all(item.get("class") in {"Model", "MeshPart"} for item in items[1:]),
        "Only Models and MeshParts are allowed inside the library; scripts are forbidden",
    )
    referents = [item.get("referent") for item in items]
    require(all(referents), "Every instance needs a referent")
    require(len(set(referents)) == len(referents), "Duplicate instance referents")
    allowed_refs = set(referents) | {"null", "nil"}
    require(
        all((ref.text or "").strip() in allowed_refs for ref in library.iter("Ref")),
        "Library has an external or unresolved instance reference",
    )

    source_strings = {}
    for entry in document.findall("SharedStrings/SharedString"):
        key = entry.get("md5")
        require(key and key not in source_strings, "Missing or duplicate SharedString key")
        source_strings[key] = entry
    used_strings = {(entry.text or "").strip() for entry in library.iter("SharedString")}
    require(used_strings <= source_strings.keys(), "Unresolved SharedString reference")

    summary = {}
    mesh_ids = set()
    texture_ids = set()
    explicit_collision_tokens = 0
    for template in templates:
        template_name = name(template)
        parts = [item for item in template.iter("Item") if item.get("class") == "MeshPart"]
        require(len(parts) == EXPECTED_PARTS[template_name], template_name + ": wrong MeshPart count")
        summary[template_name] = len(parts)
        for part in parts:
            require(
                part.findtext("Properties/bool[@name='Anchored']") == "true",
                name(part) + ": MeshPart must already be anchored in the saved place",
            )
            require(
                part.findtext("Properties/token[@name='RenderFidelity']") == "0",
                name(part) + ": RenderFidelity must be Automatic (0)",
            )
            collision = part.findtext("Properties/token[@name='CollisionFidelity']")
            if collision is not None:
                require(collision == "1", name(part) + ": CollisionFidelity must be Hull (1)")
                explicit_collision_tokens += 1
            else:
                # New Studio versions serialize physics in this opaque shared payload.
                # Preserve it exactly; do not pretend to decode its collision enum.
                physics_key = part.findtext("Properties/SharedString[@name='PhysicalConfigData']")
                require(
                    physics_key in source_strings
                    and bool((source_strings[physics_key].text or "").strip()),
                    name(part) + ": missing serialized physics configuration",
                )
            mesh_ids.add(asset_id(part, "MeshId"))
            texture_ids.add(asset_id(part, "TextureID"))
    require(len(mesh_ids) == sum(EXPECTED_PARTS.values()), "Expected 12 distinct mesh asset IDs")
    require(len(texture_ids) == 1, "Expected one shared palette texture asset ID")
    return {
        "meshParts": summary,
        "meshAssetIds": sorted(mesh_ids, key=int),
        "textureAssetIds": sorted(texture_ids, key=int),
        "instances": len(items),
        "sharedStrings": len(used_strings),
        "explicitHullTokensValidated": explicit_collision_tokens,
        "opaquePhysicsConfigurationsPreserved": 12 - explicit_collision_tokens,
    }, source_strings, used_strings


def export_library(source=SOURCE, output=OUTPUT):
    require(source.resolve() != output.resolve(), "Refusing to overwrite the authoring place")
    document = parse_xml(source)
    storage = one(document.findall("Item[@class='ServerStorage']"), "ServerStorage")
    library = one(
        [item for item in storage.findall("Item") if name(item) == "WorldArtLibrary"],
        "direct ServerStorage.WorldArtLibrary",
    )
    summary, source_strings, used_strings = validate_library(library, document)
    exported = ET.Element("roblox", dict(document.attrib))
    for value in ("null", "nil"):
        ET.SubElement(exported, "External").text = value
    exported.append(copy.deepcopy(library))
    if used_strings:
        strings = ET.SubElement(exported, "SharedStrings")
        for key in sorted(used_strings):
            strings.append(copy.deepcopy(source_strings[key]))

    ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".rbxmx.tmp", delete=False) as temp:
            temp_path = Path(temp.name)
            ET.ElementTree(exported).write(temp, encoding="utf-8", xml_declaration=True)
        roundtrip = parse_xml(temp_path)
        exported_library = one(roundtrip.findall("Item"), "exported root instance")
        require(
            ET.tostring(exported_library) == ET.tostring(library),
            "Export changed serialized library properties or hierarchy",
        )
        exported_summary, exported_strings, _ = validate_library(exported_library, roundtrip)
        require(summary == exported_summary, "Export validation changed")
        require(
            all(
                ET.tostring(exported_strings[key]) == ET.tostring(source_strings[key])
                for key in used_strings
            ),
            "Export changed serialized SharedStrings",
        )
        os.replace(temp_path, output)
        temp_path = None
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return {"source": str(source), "output": str(output), **summary}


if __name__ == "__main__":
    try:
        print(json.dumps(export_library(), indent=2))
    except (OSError, ValueError, ET.ParseError) as error:
        print("Art export failed: " + str(error), file=sys.stderr)
        sys.exit(1)
