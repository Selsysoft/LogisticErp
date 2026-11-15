package org.ece.blackrose.common.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * DTO record bileşeni OpenAPI 3.1 şemasında {@code null} alabilir işaretlenir (12.2a §4.4,
 * OK-12.2a-15): skaler alanda {@code type: [<tür>, "null"]}, şema bağlantılı alanda {@code anyOf:
 * [{$ref}, {type: "null"}]}. 3.1'de swagger-core {@code nullable} anahtarını yazmadığı için işaret
 * bir {@code OpenApiCustomizer} ile uygulanır. Opt-in: yalnız işaretli alanlar değişir.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.RECORD_COMPONENT, ElementType.FIELD})
public @interface NullableInSchema {}
