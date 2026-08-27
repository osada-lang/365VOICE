import Foundation
import Vision
import AppKit

let imagePath = "/Users/kentosada/Downloads/S__188235829.jpg"
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Failed to load image")
    exit(1)
}

let request = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
    for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        print(String(format: "Box: (%.3f, %.3f, %.3f, %.3f) -> %@", box.origin.x, box.origin.y, box.size.width, box.size.height, topCandidate.string))
    }
}

request.recognitionLevel = .accurate
request.recognitionLanguages = ["ja-JP", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])
