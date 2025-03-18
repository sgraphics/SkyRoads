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
1111111
.....1.
....11.
...11..
...11..
.......
...1...
...1...
...1...
...1...
...1...
...1...
<start>
        `.trim(),
        colors: {
            '1': 0x98FB98, // Pastel green
            '2': 0xFFB6C1, // Pastel pink
            '3': 0xAFEEEE, // Pastel turquoise
            '4': 0xFFDAB9, // Peach
            '5': 0xB0C4DE, // Pastel blue (tunnel)
            '6': 0x8794BF, // Lighter pastel blue (tunnel)
            '7': 0xFFFACD, // Pastel yellow (raised block)
            '8': 0xFFE4B5, // Pastel orange (raised block)
            '9': 0xFFB6B6, // Pastel red (speed up)
            '0': 0x98FB98  // Pastel green (slow down)
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
            '1': 0x98FB98,
            '2': 0xFFB6C1,
            '3': 0xAFEEEE,
            '4': 0xFFDAB9,
            '5': 0xB0C4DE,
            '6': 0x8794BF,
            '7': 0xFFFACD,
            '8': 0xFFE4B5,
            '9': 0xFFB6B6,
            '0': 0x98FB98
        }
    }
]; 