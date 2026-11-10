package org.ece.blackrose.identity.service;

import org.springframework.web.client.RestClient;

/** Başka paketlerdeki testlerin istemciyi sahte sunucuya bağlayarak kurması için. */
public final class BulkMailClientAccess {

  private BulkMailClientAccess() {}

  public static BulkMailClient client(RestClient.Builder builder, String apiKey, String from) {
    return new BulkMailClient(builder, apiKey, from, duration -> {});
  }
}
