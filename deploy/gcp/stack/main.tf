# The Google counterpart of deploy/aws/stack.yaml, for a trial that holds test data only
# (ADR 0037). Deploy applies it through Infrastructure Manager as im-stack before each release.
# It creates one free-tier server with a static address on a network of its own, so the
# project's default network and its open SSH rule never apply to it.

terraform {
  required_version = "~> 1.5.0" # Infrastructure Manager's free tier runs 1.5.7 at most
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.12"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

locals {
  name   = "mc-fd-dist"
  labels = { app = "mc-fd-dist" }
}

resource "google_compute_network" "trial" {
  name                    = local.name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "trial" {
  # checkov:skip=CKV_GCP_26: flow logs are charged, and the trial holds test data only.
  name                     = local.name
  network                  = google_compute_network.trial.id
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_firewall" "web" {
  # checkov:skip=CKV_GCP_106: Let's Encrypt checks the site over HTTP, and Caddy redirects the rest to HTTPS.
  name          = "${local.name}-web"
  network       = google_compute_network.trial.id
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.name]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  allow {
    protocol = "udp"
    ports    = ["443"]
  }
}

# SSH only from Google's Identity-Aware Proxy, never from the internet.
resource "google_compute_firewall" "iap_ssh" {
  name          = "${local.name}-iap-ssh"
  network       = google_compute_network.trial.id
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = [local.name]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_address" "server" {
  name   = local.name
  labels = local.labels
}

resource "google_compute_instance" "server" {
  # checkov:skip=CKV_GCP_40: a public address is how stations reach the site; SSH is closed to it.
  # checkov:skip=CKV_GCP_38: Google-managed disk encryption; a customer key adds a charge.
  name                      = local.name
  machine_type              = "e2-micro" # the free tier's machine
  tags                      = [local.name]
  labels                    = local.labels
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = 30 # the free tier's limit
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.trial.id
    access_config {
      nat_ip = google_compute_address.server.address
    }
  }

  service_account {
    email  = var.vm_service_account_email
    scopes = ["cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  # A key in metadata rather than metadata_startup_script, which would replace the server
  # whenever the setup commit changes.
  metadata = {
    enable-oslogin          = "TRUE"
    block-project-ssh-keys  = "TRUE"
    enable-guest-attributes = "TRUE" # publishes the host keys that Deploy trusts
    serial-port-enable      = "FALSE"
    startup-script          = templatefile("${path.module}/startup.sh.tftpl", { commit = var.setup_commit })
  }

  lifecycle {
    # Google moves the image family to newer builds. That must not replace a running server.
    ignore_changes = [boot_disk[0].initialize_params[0].image]
  }
}
