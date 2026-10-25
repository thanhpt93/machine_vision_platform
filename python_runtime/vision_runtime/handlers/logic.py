"""Decision & Inspection Logic Handlers (Category 7).

Includes:
- compare: Relational comparisons (>, >=, ==, <=, <, !=)
- range_check: Value in [min, max] check (inclusive/exclusive)
- logic_gate: Boolean AND, OR, NOT, XOR gates
- conditional_branch: Conditional path selector
- count_check: Validates detected object count against limits
- presence_check: Object presence/absence verification
- rule_evaluation: Multi-criteria rule evaluation without eval/exec
- decision_ok_ng: Aggregates condition inputs into OK, NG, or UNKNOWN
- result_aggregation: Consolidates measurements and verdicts into InspectionResult
"""

from typing import Any, Dict, List, Tuple


def compare_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Compares input value against reference threshold."""
    val = inputs.get("value_in")
    if val is None:
        val = float(config.get("value", 0.0))
    elif isinstance(val, dict):
        val = float(val.get("scalar_value", val.get("value", 0.0)))
    else:
        try:
            val = float(val)
        except Exception:
            val = str(val)

    ref = float(config.get("threshold", 0.0))
    operator = str(config.get("operator", "==")).strip()

    if operator == ">":
        res = bool(val > ref)
    elif operator == ">=":
        res = bool(val >= ref)
    elif operator == "<":
        res = bool(val < ref)
    elif operator == "<=":
        res = bool(val <= ref)
    elif operator == "!=":
        res = bool(val != ref)
    else:  # ==
        res = bool(val == ref)

    metadata = {"value": val, "operator": operator, "reference": ref, "result": res}
    return {"boolean_out": res}, metadata


def range_check_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Checks whether numeric value is within configured [min, max] range."""
    val = inputs.get("value_in")
    if val is None:
        val = float(config.get("value", 5.0))
    elif isinstance(val, dict):
        val = float(val.get("scalar_value", val.get("value", 0.0)))
    else:
        val = float(val)

    min_val = float(config.get("minVal", 0.0))
    max_val = float(config.get("maxVal", 10.0))
    inclusive = bool(config.get("inclusive", True))

    if inclusive:
        in_range = bool(min_val <= val <= max_val)
    else:
        in_range = bool(min_val < val < max_val)

    metadata = {"value": val, "min": min_val, "max": max_val, "in_range": in_range}
    return {"boolean_out": in_range}, metadata


def logic_gate_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Boolean operations: AND, OR, NOT, XOR."""
    gate = str(config.get("gate", "AND")).upper()
    a = bool(inputs.get("a", config.get("inputA", True)))
    b = bool(inputs.get("b", config.get("inputB", True)))

    if gate == "NOT":
        out = not a
    elif gate == "OR":
        out = a or b
    elif gate == "XOR":
        out = a ^ b
    else:  # AND
        out = a and b

    return {"boolean_out": out}, {"gate": gate, "result": out}


def conditional_branch_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Routes data based on boolean condition."""
    cond = bool(inputs.get("condition", config.get("condition", True)))
    true_val = inputs.get("true_input", "TRUE_BRANCH")
    false_val = inputs.get("false_input", "FALSE_BRANCH")

    chosen = true_val if cond else false_val
    return {"selected_out": chosen}, {"condition": cond}


def count_check_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Validates object count against configured limits."""
    detections = inputs.get("detections_in")
    if isinstance(detections, dict):
        count = int(detections.get("count", len(detections.get("objects", []))))
    elif isinstance(detections, (list, tuple)):
        count = len(detections)
    else:
        count = int(config.get("count", 0))

    min_count = int(config.get("minCount", 1))
    max_count = int(config.get("maxCount", 100))

    passed = bool(min_count <= count <= max_count)
    metadata = {"count": count, "minCount": min_count, "maxCount": max_count, "passed": passed}
    return {"boolean_out": passed, "count": count}, metadata


def presence_check_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Verifies presence/absence of objects."""
    detections = inputs.get("detections_in")
    if isinstance(detections, dict):
        count = int(detections.get("count", len(detections.get("objects", []))))
    elif isinstance(detections, (list, tuple)):
        count = len(detections)
    else:
        count = int(config.get("count", 0))

    expected_presence = bool(config.get("expectedPresence", True))
    is_present = count > 0
    passed = is_present == expected_presence

    metadata = {"is_present": is_present, "expected": expected_presence, "passed": passed}
    return {"boolean_out": passed}, metadata


def rule_evaluation_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Evaluates multi-condition rule table safely without script execution."""
    rules = config.get("rules", [
        {"field": "defect_count", "op": "==", "value": 0},
    ])

    passed_all = True
    eval_details = []

    for r in rules:
        field = r.get("field", "")
        op = r.get("op", "==")
        target = r.get("value")

        actual = inputs.get(field, config.get(field, 0))
        if op == "==":
            ok = actual == target
        elif op == "<=":
            ok = actual <= target
        elif op == ">=":
            ok = actual >= target
        elif op == "<":
            ok = actual < target
        elif op == ">":
            ok = actual > target
        else:
            ok = actual != target

        eval_details.append({"field": field, "actual": actual, "target": target, "passed": ok})
        if not ok:
            passed_all = False

    res = {"all_passed": passed_all, "rules": eval_details}
    return {"boolean_out": passed_all, "rule_report": res}, res


def decision_ok_ng_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Aggregates condition flags into OK, NG, or UNKNOWN verdict."""
    cond = inputs.get("condition")
    if cond is None:
        cond = inputs.get("boolean_in", config.get("status", True))

    fail_reasons: List[str] = []

    if isinstance(cond, bool):
        verdict = "OK" if cond else "NG"
        if not cond:
            fail_reasons.append(config.get("failReason", "Tolerance condition violated"))
    elif cond == "OK" or cond == "PASS":
        verdict = "OK"
    elif cond == "NG" or cond == "FAIL":
        verdict = "NG"
        fail_reasons.append("Inspection failed")
    else:
        verdict = "UNKNOWN"

    res = {
        "verdict": verdict,
        "is_ok": verdict == "OK",
        "defect_reasons": fail_reasons,
    }

    return {"verdict": verdict, "boolean_out": verdict == "OK", "inspection_result": res}, res


def result_aggregation_handler(
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    workspace_dir: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Consolidates measurements, defect counts, and verdicts into a structured InspectionResult."""
    measurements = inputs.get("measurements", {})
    verdict = inputs.get("verdict", "OK")
    defects = inputs.get("defects", [])

    aggregated = {
        "verdict": verdict,
        "is_pass": verdict == "OK",
        "measurements": measurements,
        "defect_count": len(defects) if isinstance(defects, list) else 0,
        "defects": defects,
    }

    return {"inspection_result": aggregated}, aggregated
