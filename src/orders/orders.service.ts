import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { Product } from 'src/products/entities/product.entity';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

@Injectable()
export class OrdersService {

  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    private amqpConnection: AmqpConnection,
  ) {}

  async create(createOrderDto: CreateOrderDto & { client_id: number }) {
    const productIds = createOrderDto.items.map(item => item.product_id);
    const uniqueProductIds = [...new Set(productIds)]
    const  products = await this.productRepo.findBy({
      id: In(uniqueProductIds),
    });

    if(products.length !== uniqueProductIds.length) {
      throw new Error(
        `Algum produto não foi encontrado. Produtos passados ${productIds}, produtos encontrados ${products.map(product => product.id)}`
      );
    }

    const order = Order.create({
      client_id: createOrderDto.client_id,
      items: createOrderDto.items.map(item => {
        const product = products.find(product => product.id === item.product_id,);
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          price: product.price,
        }
      },),
    });
    await this.orderRepo.save(order);
    await this.amqpConnection.publish('amq.direct', 'order.created', {
      orderId: order.id,
      card_hash: createOrderDto.card_hash,
      total: order.total,
    });
    return order;
  }

  findAll(client_id: number) {
    return this.orderRepo.find({
      where: {
        client_id,
        },
        order: {
          created_at: 'DESC',
        },
      });
  }

  findOne(id: string, client_id: number) {
    return this.orderRepo.findOneByOrFail({
      id,
      client_id,
    })
  }
}