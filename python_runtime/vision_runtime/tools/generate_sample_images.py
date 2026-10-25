"""Script to generate synthetic industrial inspection sample images."""

import os
import cv2
import numpy as np


def create_pcb_board() -> np.ndarray:
    """Generate a 640x480 synthetic PCB image."""
    img = np.full((480, 640, 3), (20, 80, 30), dtype=np.uint8)  # Dark green PCB substrate

    # Draw copper traces
    for y in range(40, 440, 30):
        cv2.line(img, (30, y), (610, y), (0, 180, 200), 2)
    for x in range(50, 600, 45):
        cv2.line(img, (x, 30), (x, 450), (0, 180, 200), 2)

    # Draw IC chip in the center (black rectangle)
    cv2.rectangle(img, (220, 160), (420, 320), (30, 30, 30), -1)
    cv2.putText(img, "VISION-MCU", (245, 245), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)

    # Draw IC pins
    for px in range(235, 410, 15):
        cv2.rectangle(img, (px, 145), (px + 8, 160), (190, 190, 210), -1)
        cv2.rectangle(img, (px, 320), (px + 8, 335), (190, 190, 210), -1)

    # Solder pads with defects (some solder bridges and components)
    cv2.circle(img, (120, 120), 18, (220, 220, 240), -1)
    cv2.circle(img, (160, 120), 18, (220, 220, 240), -1)
    # Solder bridge defect connecting pad 1 and pad 2
    cv2.rectangle(img, (120, 115), (160, 125), (220, 220, 240), -1)

    # Normal capacitor & resistor pads
    cv2.circle(img, (500, 120), 14, (200, 200, 230), -1)
    cv2.circle(img, (540, 120), 14, (200, 200, 230), -1)

    cv2.circle(img, (120, 380), 16, (210, 210, 230), -1)
    cv2.circle(img, (500, 380), 20, (230, 230, 240), -1)

    return img


def create_gear_defect() -> np.ndarray:
    """Generate a mechanical gear image with a missing tooth."""
    img = np.full((400, 400, 3), (240, 240, 240), dtype=np.uint8)  # Light gray background
    center = (200, 200)
    radius = 120

    # Draw gear teeth
    num_teeth = 16
    for i in range(num_teeth):
        # Skip tooth 3 to simulate a defect
        if i == 3:
            continue
        angle = i * (2 * np.pi / num_teeth)
        tx = int(center[0] + (radius + 25) * np.cos(angle))
        ty = int(center[1] + (radius + 25) * np.sin(angle))
        cv2.circle(img, (tx, ty), 16, (70, 70, 80), -1)

    # Draw gear body
    cv2.circle(img, center, radius, (70, 70, 80), -1)
    # Center bore hole
    cv2.circle(img, center, 45, (240, 240, 240), -1)

    return img


def create_bottle_cap() -> np.ndarray:
    """Generate a circular bottle cap with a scratch/crack."""
    img = np.full((360, 360, 3), (30, 30, 35), dtype=np.uint8)  # Dark background
    center = (180, 180)

    # Outer cap rim
    cv2.circle(img, center, 140, (0, 120, 230), -1)  # Orange cap
    cv2.circle(img, center, 130, (0, 140, 255), -1)
    cv2.circle(img, center, 100, (0, 100, 210), 3)

    # Crack defect
    pts = np.array([[180, 60], [175, 90], [185, 120], [170, 150]], np.int32)
    cv2.polylines(img, [pts], False, (20, 20, 20), 4)

    return img


def main():
    target_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "sample_images"))
    os.makedirs(target_dir, exist_ok=True)

    pcb = create_pcb_board()
    gear = create_gear_defect()
    cap = create_bottle_cap()

    cv2.imwrite(os.path.join(target_dir, "pcb_board.png"), pcb)
    cv2.imwrite(os.path.join(target_dir, "gear_defect.png"), gear)
    cv2.imwrite(os.path.join(target_dir, "bottle_cap.png"), cap)

    print(f"Sample images successfully created in: {target_dir}")


if __name__ == "__main__":
    main()
