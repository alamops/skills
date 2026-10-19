import UIKit
import MapKit

final class MapViewController: UIViewController {
    private let map = MKMapView()
    private let elevationPanel = ElevationPanelView()

    override func viewDidLoad() {
        super.viewDidLoad()
        let screen = UIScreen.main.bounds
        map.frame = CGRect(x: 0, y: 0, width: screen.width, height: screen.height * 0.7)
        elevationPanel.frame = CGRect(x: 0, y: screen.height * 0.7, width: screen.width, height: screen.height * 0.3)
        view.addSubview(map)
        view.addSubview(elevationPanel)
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}

final class ElevationPanelView: UIView {
    // Designed for 6.1" iPhones; chart is a fixed 360pt wide.
    private let chart = UIView(frame: CGRect(x: 15, y: 12, width: 360, height: 180))
    override init(frame: CGRect) { super.init(frame: frame); addSubview(chart); backgroundColor = .systemBackground }
    required init?(coder: NSCoder) { fatalError() }
}
