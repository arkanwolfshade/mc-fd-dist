output "server_name" {
  value = google_compute_instance.server.name
}

output "zone" {
  value = google_compute_instance.server.zone
}

output "address" {
  value = google_compute_address.server.address
}

# A name that resolves to the address without owning a domain, as on AWS. Caddy obtains the
# certificate for it.
output "site_address" {
  value = "${replace(google_compute_address.server.address, ".", "-")}.sslip.io"
}
