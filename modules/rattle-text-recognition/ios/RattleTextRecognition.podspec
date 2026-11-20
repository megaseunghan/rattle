Pod::Spec.new do |s|
  s.name = 'RattleTextRecognition'
  s.version = '1.0.0'
  s.summary = 'On-device receipt text recognition'
  s.description = 'Local Vision OCR and measurement helpers for Rattle.'
  s.license = { :type => 'Proprietary' }
  s.author = 'Rattle'
  s.homepage = 'https://github.com/megaseunghan/rattle'
  s.source = { :git => 'https://github.com/megaseunghan/rattle.git' }
  s.platform = :ios, '15.1'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO', 'PhotosUI', 'UniformTypeIdentifiers'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
