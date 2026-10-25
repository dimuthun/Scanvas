# Acquire one page from a WIA scanner (Windows Image Acquisition) and save it as PNG.
# Exit codes: 0 = saved, 2 = no scanner connected, 3 = cancelled by the user, 1 = other error.
param([Parameter(Mandatory = $true)][string]$OutFile)

$ErrorActionPreference = 'Stop'
$WiaFormatPng = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'
$ScannerDeviceType = 1
$ColorIntent = 1
$MaximizeQuality = 131072

try {
  $manager = New-Object -ComObject WIA.DeviceManager
  $scanners = @($manager.DeviceInfos | Where-Object { $_.Type -eq $ScannerDeviceType })
  if ($scanners.Count -eq 0) { exit 2 }

  # Shows the standard WIA scan dialog (device choice, preview, resolution, color mode).
  $dialog = New-Object -ComObject WIA.CommonDialog
  $image = $dialog.ShowAcquireImage($ScannerDeviceType, $ColorIntent, $MaximizeQuality, $WiaFormatPng, $false, $true, $false)
  if ($null -eq $image) { exit 3 }

  if ($image.FormatID -ne $WiaFormatPng) {
    $process = New-Object -ComObject WIA.ImageProcess
    $process.Filters.Add($process.FilterInfos.Item('Convert').FilterID)
    $process.Filters.Item(1).Properties.Item('FormatID').Value = $WiaFormatPng
    $image = $process.Apply($image)
  }

  if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile }
  $image.SaveFile($OutFile)
  exit 0
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
