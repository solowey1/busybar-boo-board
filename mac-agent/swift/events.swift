import EventKit
import Foundation

// Prints the upcoming (non all-day) calendar events as JSON: [{"title","start","end","calendar"}]
// Usage: events [hoursAhead]   (default 24)
let hours = Double(CommandLine.arguments.dropFirst().first ?? "24") ?? 24
let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)
var granted = false

if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { ok, _ in granted = ok; sem.signal() }
} else {
    store.requestAccess(to: .event) { ok, _ in granted = ok; sem.signal() }
}
_ = sem.wait(timeout: .now() + 60)

guard granted else {
    FileHandle.standardError.write("calendar access denied\n".data(using: .utf8)!)
    exit(2)
}

let now = Date()
let end = now.addingTimeInterval(hours * 3600)
let predicate = store.predicateForEvents(withStart: now.addingTimeInterval(-60), end: end, calendars: nil)
let events = store.events(matching: predicate)
    .filter { !$0.isAllDay && $0.endDate > now && $0.status != .canceled }
    .sorted { $0.startDate < $1.startDate }
    .prefix(10)
    .map { e -> [String: Any] in
        ["title": e.title ?? "", "start": Int(e.startDate.timeIntervalSince1970), "end": Int(e.endDate.timeIntervalSince1970), "calendar": e.calendar.title]
    }
let data = try JSONSerialization.data(withJSONObject: Array(events))
FileHandle.standardOutput.write(data)
