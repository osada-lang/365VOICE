import Foundation
import Vision
import AppKit

let imagePath = "/Users/kentosada/Downloads/S__188235829.jpg"
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Failed to load image")
    exit(1)
}

struct Item {
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let text: String
}

var items: [Item] = []

let request = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
    for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        items.append(Item(x: box.origin.x, y: box.origin.y, w: box.size.width, h: box.size.height, text: topCandidate.string))
    }
}

request.recognitionLevel = .accurate
request.recognitionLanguages = ["ja-JP", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])

// Sort by Y descending (top to bottom), then X ascending
items.sort { a, b in
    if abs(a.y - b.y) > 0.02 {
        return a.y > b.y
    }
    return a.x < b.x
}

for item in items {
    print(String(format: "y:%.2f x:%.2f -> %@", item.y, item.x, item.text))
}
