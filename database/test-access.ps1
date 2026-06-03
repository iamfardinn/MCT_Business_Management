try {
    $conn = New-Object -ComObject ADODB.Connection
    $conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=A:\MTB\MCT-Run.accdb;")
    Write-Host "SUCCESS: ACE OLEDB 12.0 provider works"
    $conn.Close()
} catch {
    Write-Host "ACE OLEDB failed: $($_.Exception.Message)"
    try {
        $conn2 = New-Object -ComObject ADODB.Connection
        $conn2.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=A:\MTB\MCT-Run.accdb;")
        Write-Host "SUCCESS: JET 4.0 provider works"
        $conn2.Close()
    } catch {
        Write-Host "JET failed: $($_.Exception.Message)"
        Write-Host "No Access provider available"
    }
}
