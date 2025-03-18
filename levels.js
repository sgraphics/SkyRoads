// Level format:
// 1-4: Normal paths (different colors)
// 5-6: Tunnels (different colors)
// 7-8: Raised blocks (different colors)
// 9-0: Special paths (speed up/slow down)
// Space: Gap
// .: Empty space

export const levels = [
    {
        name: "Level 1",
        data: `
<end>
...2...
...2...
...2...
...2...
..1.1..
..1.1..
..1 1..
..111..
..1111.
.....1.
....11.
...1...
...1...
.......
...1...
...1...
<start>
        `.trim(),
        colors: {
            '1': 0x808080, // Gray
            '2': 0x404040, // Dark gray
            '3': 0x606060, // Medium gray
            '4': 0x707070, // Light gray
            '5': 0x0000ff, // Blue tunnel
            '6': 0x0000aa, // Dark blue tunnel
            '7': 0xffff00, // Yellow raised block
            '8': 0xffaa00, // Orange raised block
            '9': 0xff0000, // Red (speed up)
            '0': 0x00ff00  // Green (slow down)
        }
    },
    {
        name: "Level 2",
        data: `
<end>
..3.3.
..3.3.
..3.3.
..3.3.
..2.2.
..2.2.
..2.2.
..2.2.
..1.1.
..1.1.
..1.1.
..1.1.
<start>
        `.trim(),
        colors: {
            '1': 0x808080,
            '2': 0x404040,
            '3': 0x606060,
            '4': 0x707070,
            '5': 0x0000ff,
            '6': 0x0000aa,
            '7': 0xffff00,
            '8': 0xffaa00,
            '9': 0xff0000,
            '0': 0x00ff00
        }
    }
]; 