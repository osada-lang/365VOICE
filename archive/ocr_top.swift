import Foundation
import Vision
import AppKit

let imagePath = "/Users/kentosada/Downloads/S__188235829.jpg"
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }

struct Item { let x, y, w, h: Double; let text: String }
var items: [Item] = []

let request = VNRecognizeTextRequest { req, _ in
    guard let obs = req.results as? [VNRecognizedTextObservation] else { return }
    for o in obs {
        guard let candidate = o.topCandidates(1).first else { continue }
        let box = o.boundingBox
        items.append(Item(x: box.origin.x, y: box.origin.y, w: box.size.width, h: box.size.height, text: candidate.string))
    }
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ja-JP", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])

items.sort { $0.y > $1.y }

for item in items where item.y > 0.60 {
    print(String(format: "y:%.2f x:%.2f -> %@", item.y, item.x, item.text))
}
