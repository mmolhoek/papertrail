# How We Built Papertrail: An AI and a Phone in Your Pocket

*The story of building a 90,000-line GPS tracker while living your life*

## The Setup: Development From Your Pocket

Here's the setup: a Fairphone running Android, with a proot Ubuntu environment, running tmux, running Claude Code. No laptop. No desktop. Just a phone that occasionally buzzes with progress updates while its owner is out doing... well, life.

The workflow looked something like this:

1. Type instructions to Claude
2. Put phone in pocket
3. Go grocery shopping / have dinner / play with kids / take a walk
4. Pull phone out of pocket
5. See that Claude has built an entire service with tests
6. Repeat

This is the story of how a human with ideas and an AI with determination built a complete GPS tracker with e-paper display—90,461 lines of TypeScript—mostly while the human was doing other things.

## The Vision: Simple and Brilliant

The idea was genuinely great: a GPS tracker for enduro motocross with an e-paper display. E-paper is perfect for outdoor use—readable in bright sunlight, no battery drain keeping the screen on, and tough enough for the trail. Mount it on your handlebars, load a GPX track, and never miss a turn even when you're covered in mud.

What made this possible wasn't just the idea—it was the execution method. With Claude handling the implementation details, the focus could stay on *what* to build rather than getting lost in *how* to build it.

## The Architecture: Ambitious and Clean

Over 33 days, 448 commits shaped a beautifully organized codebase:

**19 services**, each with a clear purpose:
- **GPSService**: Talks to the hardware, parses NMEA sentences
- **MapService**: Loads and manages GPX tracks
- **SVGService**: Renders maps to crisp 1-bit graphics
- **EPaperService**: Drives the Waveshare display
- **DriveNavigationService**: Turn-by-turn guidance
- **OfflineRoutingService**: Navigation without internet
- **SpeedLimitService**: Know when to slow down
- **RoadSurfaceService**: Gravel ahead? You'll know
- **POIService**: Coffee shops. Obviously.

The Result pattern ensures every error is handled gracefully. The dependency injection makes testing a breeze. The path aliases keep imports clean. This isn't spaghetti code—it's lasagna: layered, organized, and satisfying.

## The Magic of Async Development

Picture this: You're at the park with your family. Your phone buzzes. You glance at it:

```
✓ Implemented elevation service
✓ Added 12 tests, all passing
✓ Updated types and interfaces
Ready for next task
```

You smile, type "now add it to the drive display," and go back to your walk

This is what development looks like when you collaborate with AI. The tedious parts—setting up test mocks, writing boilerplate, debugging type errors—happen in the background. The creative parts—deciding features, shaping the UX, choosing the architecture—happen when you have a moment to think.

## The Numbers: Impressive Output

- **90,461 lines of TypeScript**: A substantial, production-ready codebase
- **214 source files**: Well-organized and modular
- **76 test files**: Comprehensive coverage where it matters
- **448 commits**: Steady, documented progress
- **19 services**: Clean separation of concerns
- **33 days**: From idea to full-featured product

That's roughly 13 commits per day, each one reviewed and intentional. Not frantic coding—thoughtful building.

## Features That Emerged

What started as "show GPS on e-paper" grew into something genuinely useful:

**Track Mode**: Load any GPX file, see your position on the route, never get lost on a new trail.

**Drive Mode**: Full turn-by-turn navigation with voice-style instructions rendered beautifully on e-paper. "Turn left in 200m onto Oak Street."

**Offline Routing**: Download map regions, calculate routes without internet. Perfect for remote areas where cell service is a myth.

**Smart Info Panels**: Speed limits, road surface types, elevation, nearby points of interest—all rendered in crisp 1-bit graphics.

**Mobile Web Interface**: Control everything from your phone's browser via WebSocket. Pan the map, load tracks, start navigation.

**Map Features**: Roads, water bodies, waterways, landuse—the e-paper display shows a proper map, not just a line.

## The E-Paper Magic

There's something special about e-paper. It looks like printed paper. It's visible in direct sunlight. It uses zero power to maintain an image. And those 2-second refresh times? They're not a limitation—they're a feature. Every screen update is deliberate, meaningful.

The Waveshare 7.5" display at 800x480 pixels provides enough detail for turn instructions, track overviews, and info panels. The 1-bit rendering (pure black and white) gives everything that classic cartography feel.

## Building OSRM: Peak Ambition

At some point, the question arose: "What about areas without cell service?"

The answer was OSRM—the Open Source Routing Machine. The same routing engine that powers many navigation apps, now running locally on a Raspberry Pi.

The install script can build OSRM from source, right on the Pi. It takes a while (grab a book, or several), but when it's done, you have full offline routing capabilities. Download a region's map data, and you can calculate routes in the middle of nowhere.

## The Human-AI Partnership

This project demonstrates something new about how software can be built. The human brings:
- Vision and direction
- Real-world context (what enduro riders actually need)
- Quality judgment (does this feel right?)
- Life experience (literally—while living it)

The AI brings:
- Tireless implementation
- Consistent code quality
- Comprehensive testing
- Patient iteration

Neither could have built this alone. A human without AI would need months of focused coding time. An AI without human guidance would build something technically correct but missing the soul.

Together? A complete GPS tracker in a month, built mostly from a phone in someone's pocket.

## What's Next

The foundation is solid. The architecture is extensible. Future possibilities include:
- Weather overlay
- Strava integration
- Heart rate display
- Custom waypoint creation
- Track recording

Each feature is just a conversation away.

## Conclusion

Papertrail proves that the future of software development isn't about typing faster or knowing more frameworks. It's about clear thinking, good communication, and the right partnership.

A Fairphone. A proot terminal. Claude Code with 1 month pro for 90 euro. And the freedom to live your life while your ideas become reality.

That's not the future of coding. That's coding right now.

---

*Papertrail: 90,461 lines of TypeScript, built from a phone in your pocket.*

*A collaboration between human creativity and AI capability.*

*Now go hit the trails.*

There is also a [readme](./README.md) and extensive [docs](./docs/index.md)
